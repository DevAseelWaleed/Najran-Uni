import { Controller, Get, Query, Param, Req, Res, BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { Response } from 'express';
import { db } from './db';
import { Permit } from './security';
import { facultyWhere } from './faculty';
import { audit } from './audit';
import { branding } from './admin';
import { institutionIdentity } from './identity';
export const columns = [
  ['employeeNumber', 'الرقم الوظيفي'],
  ['fullName', 'الاسم الكامل'],
  ['email', 'البريد الجامعي'],
  ['collegeId', 'الكلية'],
  ['departmentId', 'القسم'],
  ['academicRank', 'الرتبة العلمية'],
  ['highestQualification', 'أعلى مؤهل'],
  ['employmentType', 'نوع التوظيف'],
  ['employmentStatus', 'الحالة الوظيفية'],
  ['generalSpecialization', 'التخصص العام'],
  ['specificSpecialization', 'التخصص الدقيق'],
  ['graduationYear', 'سنة التخرج'],
] as const;
export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function safeCell(value: any) {
  return typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
}
export async function workbook(rows: any[], selected?: string[], brand = institutionIdentity()) {
  const wb = new ExcelJS.Workbook();
  wb.creator = brand.universityName;
  wb.title = brand.systemName;
  wb.subject = `${brand.universityName} | ${brand.collegeName}`;
  const ws = wb.addWorksheet('أعضاء هيئة التدريس', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  const cs = selected ? columns.filter(([k]) => selected.includes(k)) : columns;
  if (!cs.length) throw new BadRequestException('اختر عمودًا صالحًا للتصدير');
  ws.columns = cs.map(([key, header]) => ({ key, header, width: key === 'fullName' ? 32 : 24 }));
  for (const row of rows) {
    const out = {
      ...row,
      collegeId: row.college?.name || row.collegeId,
      departmentId: row.department?.name || row.departmentId,
    };
    ws.addRow(Object.fromEntries(cs.map(([k]) => [k, safeCell(out[k])])));
  }
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + brand.primaryColor.slice(1).toUpperCase() } };
  ws.headerFooter.oddHeader = `&R${brand.universityName}&C${brand.systemName}&L${brand.collegeName}`;
  ws.headerFooter.oddFooter = '&C&P / &N';
  ws.autoFilter = { from: 'A1', to: { row: 1, column: cs.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
export async function pdf(rows: any[], profile = false) {
  const brand: any = await branding();
  const font = await readFile(
    require.resolve('@fontsource/cairo/files/cairo-arabic-400-normal.woff2'),
  );
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PDF_BROWSER_CHANNEL || 'chromium',
  });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    const heading = profile ? 'ملف عضو هيئة التدريس' : 'سجل أعضاء هيئة التدريس';
    const table = profile
      ? `<table>${Object.entries({
          ...rows[0],
          collegeId: rows[0]?.college?.name,
          departmentId: rows[0]?.department?.name,
        })
          .filter(
            ([k]) =>
              ![
                'documents',
                'qualifications',
                'deletedAt',
                'id',
                'college',
                'department',
                'createdAt',
                'updatedAt',
              ].includes(k),
          )
          .map(
            ([k, v]) =>
              `<tr><th>${escapeHtml(columns.find((c) => c[0] === k)?.[1] || profileLabels[k] || k)}</th><td>${escapeHtml(v instanceof Date ? v.toLocaleDateString('ar-SA', { calendar: 'gregory' }) : v)}</td></tr>`,
          )
          .join(
            '',
          )}</table><h3>المؤهلات العلمية</h3>${(rows[0]?.qualifications || []).map((q: any) => `<p>${escapeHtml(q.degree)} · ${escapeHtml(q.university)} · ${escapeHtml(q.year)}</p>`).join('')}`
      : `<table><thead><tr>${['الرقم الوظيفي', 'الاسم', 'القسم', 'الرتبة', 'المؤهل', 'الحالة'].map((v) => `<th>${v}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${[r.employeeNumber, r.fullName, r.department.name, r.academicRank, r.highestQualification, r.employmentStatus].map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    await page.setContent(
      `<html lang="ar" dir="rtl"><style>@font-face{font-family:Cairo;src:url(data:font/woff2;base64,${font.toString('base64')})}body{font-family:Cairo;font-size:11px;color:${escapeHtml(brand.primaryColor)}}table{border-collapse:collapse;width:100%}th,td{padding:8px;border:1px solid #ddd;text-align:right}thead{display:table-header-group}tr{break-inside:avoid}h1{font-size:22px}header{border-bottom:3px solid ${escapeHtml(brand.accentColor)};padding-bottom:12px}</style><header>${brand.logoDataUrl ? `<img style="width:auto;height:auto;max-height:70px;max-width:180px;object-fit:contain" src="${brand.logoDataUrl}" alt="شعار الجامعة"/>` : '<div>موضع شعار الجامعة (قابل للاستبدال)</div>'}<h2>${escapeHtml(brand.universityName)} · ${escapeHtml(brand.collegeName)}</h2><p>${escapeHtml(brand.systemName)}</p></header><h1>${heading}</h1><p>${new Date().toLocaleDateString('ar-SA')}</p>${table}</html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: 'A4',
      landscape: !profile,
      printBackground: true,
      margin: { top: '15mm', bottom: '20mm', left: '12mm', right: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:9px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    await browser.close();
  }
}
const profileLabels: Record<string, string> = {
  birthDate: 'تاريخ الميلاد',
  appointmentDate: 'تاريخ التعيين',
  joiningDate: 'تاريخ المباشرة',
  englishName: 'الاسم بالإنجليزية',
  gender: 'الجنس',
  nationality: 'الجنسية',
  mobile: 'الجوال',
  awardingUniversity: 'الجامعة المانحة',
  awardingCountry: 'الدولة المانحة',
  researchInterests: 'الاهتمامات البحثية',
  jobTitle: 'المسمى الوظيفي',
  administrativePosition: 'المنصب الإداري',
  officeNumber: 'المكتب',
  officePhone: 'هاتف المكتب',
};
@Controller('exports')
@Permit('data.export')
export class ExportController {
  @Get(':format') async list(
    @Param('format') format: string,
    @Query() q: any,
    @Req() req: any,
    @Res() res: Response,
  ) {
    if (!['xlsx', 'pdf'].includes(format)) throw new BadRequestException('صيغة غير مدعومة');
    const where = facultyWhere(q);
    if ((await db.facultyMember.count({ where })) > 10000)
      throw new BadRequestException('قلل النتائج إلى 10000 سجل');
    const rows = await db.facultyMember.findMany({
      where,
      include: { college: true, department: true },
      orderBy: { fullName: 'asc' },
      take: 10000,
    });
    const data = format === 'xlsx' ? await workbook(rows, q.columns?.split(','), await branding()) : await pdf(rows);
    await audit(req.user.id, 'DATA_EXPORT', undefined, { format, count: rows.length });
    res
      .type(
        format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
      )
      .attachment(`faculty.${format}`)
      .send(data);
  }
  @Get('profile/:id') async profile(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const row = await db.facultyMember.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: { college: true, department: true, qualifications: true },
    });
    const data = await pdf([row], true);
    await audit(req.user.id, 'PROFILE_EXPORT', id);
    res.type('application/pdf').attachment('faculty-profile.pdf').send(data);
  }
}
