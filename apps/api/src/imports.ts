import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { db } from './db';
import { Permit } from './security';
import { parse, facultySchema } from './validation';
import { workbook, columns, safeCell } from './exports';
import { audit } from './audit';
import { validateZip } from './xlsx-security';
@Controller('imports')
@Permit('data.import')
export class ImportController {
  @Get('template') async template(@Res() res: Response) {
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .attachment('faculty-template.xlsx')
      .send(await workbook([]));
  }
  @Post('inspect')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async inspect(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file || file.buffer.subarray(0, 2).toString() !== 'PK')
      throw new BadRequestException('اختر ملف XLSX صالحًا');
    validateZip(file.buffer);
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer as any);
    } catch {
      throw new BadRequestException('تعذر قراءة ملف XLSX');
    }
    if (!wb.worksheets.length) throw new BadRequestException('المصنف فارغ');
    const sheets = wb.worksheets.map((ws) => {
      if (ws.rowCount > 2001 || ws.columnCount > 80)
        throw new BadRequestException('الحد الأقصى 2000 صف و80 عمودًا');
      return {
        name: ws.name,
        headers: (ws.getRow(1).values as any[])
          .slice(1)
          .map((v) => (typeof v === 'string' ? v : '')),
        rows: Array.from({ length: Math.max(0, ws.rowCount - 1) }, (_, i) =>
          (ws.getRow(i + 2).values as any[])
            .slice(1)
            .map((v) => (typeof v === 'object' && v !== null ? '' : (v ?? ''))),
        ),
      };
    });
    const job = await db.importJob.create({
      data: { userId: req.user.id, rows: JSON.parse(JSON.stringify(sheets)), errors: [] },
    });
    return {
      id: job.id,
      sheets: sheets.map((s) => ({ name: s.name, headers: s.headers, count: s.rows.length })),
      fields: columns,
    };
  }
  @Post(':id/preview') async preview(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const input = parse(
      z.object({ sheet: z.string(), mapping: z.record(z.number().int().min(0).max(79)) }),
      body,
    );
    const job = await db.importJob.findFirstOrThrow({
      where: { id, userId: req.user.id, status: 'PREVIEW' },
    });
    const sheets = job.rows as any[];
    const sheet = sheets.find((s) => s.name === input.sheet);
    if (!sheet) throw new BadRequestException('ورقة غير موجودة');
    const colleges = await db.college.findMany();
    const departments = await db.department.findMany();
    const existing = new Set(
      (await db.facultyMember.findMany({ select: { collegeId: true, employeeNumber: true } })).map(
        (f) => `${f.collegeId}:${f.employeeNumber}`,
      ),
    );
    const valid: any[] = [];
    const errors: any[] = [];
    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      if (!row.some((v: any) => v !== '')) continue;
      const data: any = {};
      for (const [field, index] of Object.entries(input.mapping)) {
        if (!columns.some((c) => c[0] === field)) continue;
        const v = row[index] ?? '';
        data[field] = field === 'graduationYear' ? v : String(v);
      }
      data.collegeId = colleges.find(
        (c) => c.id === data.collegeId || c.name === data.collegeId,
      )?.id;
      data.departmentId = departments.find(
        (d) =>
          d.collegeId === data.collegeId &&
          (d.id === data.departmentId || d.name === data.departmentId),
      )?.id;
      const parsed = facultySchema.safeParse(data);
      if (!parsed.success) {
        errors.push({
          row: i + 2,
          message: parsed.error.issues.map((e) => `${e.path}: ${e.message}`).join('؛ '),
        });
        continue;
      }
      const key = `${parsed.data.collegeId}:${parsed.data.employeeNumber}`;
      if (existing.has(key)) {
        errors.push({ row: i + 2, message: 'رقم وظيفي مكرر؛ سيتم التخطي' });
        continue;
      }
      existing.add(key);
      valid.push(parsed.data);
    }
    await db.importJob.update({
      where: { id },
      data: { rows: JSON.parse(JSON.stringify(valid)), errors, status: 'VALIDATED' },
    });
    return { id, validCount: valid.length, errors, preview: valid.slice(0, 20) };
  }
  @Post(':id/commit') async commit(@Param('id') id: string, @Req() req: any) {
    const result = await db.$transaction(async (tx) => {
      const job = await tx.importJob.findFirstOrThrow({
        where: { id, userId: req.user.id, status: 'VALIDATED' },
      });
      const claim = await tx.importJob.updateMany({
        where: { id, status: 'VALIDATED' },
        data: { status: 'IMPORTING' },
      });
      if (!claim.count) throw new BadRequestException('تم تنفيذ الاستيراد سابقًا');
      const rows = (job.rows as any[]).map((r) => {
        const { qualifications, ...data } = parse(facultySchema, r);
        return data;
      });
      const result = await tx.facultyMember.createMany({ data: rows, skipDuplicates: true });
      await tx.importJob.update({
        where: { id },
        data: { status: 'COMPLETED', imported: result.count },
      });
      return {
        imported: result.count,
        skipped: rows.length - result.count,
        invalid: (job.errors as any[]).length,
      };
    });
    await audit(req.user.id, 'FACULTY_IMPORT', id, result);
    return result;
  }
  @Get(':id/errors') async errors(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const job = await db.importJob.findFirstOrThrow({ where: { id, userId: req.user.id } });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الأخطاء', { views: [{ rightToLeft: true }] });
    ws.columns = [
      { header: 'الصف', key: 'row', width: 12 },
      { header: 'الخطأ', key: 'message', width: 100 },
    ];
    for (const e of job.errors as any[]) ws.addRow({ row: e.row, message: safeCell(e.message) });
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .attachment('import-errors.xlsx')
      .send(Buffer.from(await wb.xlsx.writeBuffer()));
  }
}
