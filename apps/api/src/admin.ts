import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Req,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { detectMime } from './storage';
import { z } from 'zod';
import { db } from './db';
import { Public, Permit } from './security';
import { parse, paging } from './validation';
import { ranks, degrees, statuses, employmentTypes } from './policy';
import { audit } from './audit';
import { institutionIdentity } from './identity';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { developmentMailboxUrl } from './mail';
const officialLogo = readFile(resolve(__dirname, '../assets/najran-university.jpeg'))
  .then(bytes => `data:image/jpeg;base64,${bytes.toString('base64')}`);
export async function branding() {
  const s = await db.setting.findUnique({ where: { key: 'branding' } });
  const logo = await db.setting.findUnique({ where: { key: 'brandLogo' } });
  return {
    ...institutionIdentity(),
    ...((s?.value as any) || {}),
    logoDataUrl: logo?.value || await officialLogo,
    developmentMailboxUrl: developmentMailboxUrl(),
  };
}
@Controller()
export class AdminController {
  @Public() @Get('branding') async brand() {
    return branding();
  }
  @Post('settings/logo')
  @Permit('settings.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  async logo(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('اختر صورة');
    const mime = detectMime(file.buffer);
    if (mime === 'application/pdf') throw new BadRequestException('الشعار يجب أن يكون PNG أو JPEG');
    const value = `data:${mime};base64,${file.buffer.toString('base64')}`;
    await db.setting.upsert({
      where: { key: 'brandLogo' },
      create: { key: 'brandLogo', value },
      update: { value },
    });
    await audit(req.user.id, 'BRAND_LOGO_UPDATE');
    return { message: 'تم حفظ الشعار' };
  }
  @Get('references') async refs() {
    return {
      colleges: await db.college.findMany({
        include: { departments: true },
        orderBy: { name: 'asc' },
      }),
      ranks,
      degrees,
      statuses,
      employmentTypes,
    };
  }
  @Post('colleges') @Permit('settings.manage') async college(
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const data = parse(z.object({ name: z.string().trim().min(2).max(200) }).strict(), body);
    const c = await db.college.create({ data });
    await audit(req.user.id, 'COLLEGE_CREATE', c.id);
    return c;
  }
  @Post('departments') @Permit('settings.manage') async department(
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const data = parse(
      z.object({ name: z.string().trim().min(2).max(200), collegeId: z.string().uuid() }).strict(),
      body,
    );
    const d = await db.department.create({ data });
    await audit(req.user.id, 'DEPARTMENT_CREATE', d.id);
    return d;
  }
  @Put('settings') @Permit('settings.manage') async settings(
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const data = parse(
      z
        .object({
          universityName: z.string().trim().min(2).max(200),
          collegeName: z.string().trim().min(2).max(200),
          systemName: z.string().trim().min(2).max(200).optional(),
          homeTitle: z.string().trim().min(2).max(250).optional(),
          accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
          primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          logoUrl: z
            .string()
            .max(2000)
            .refine((v) => !v || /^https:\/\//.test(v), 'رابط الشعار يجب أن يبدأ بـ https'),
        })
        .strict(),
      body,
    );
    await db.setting.upsert({
      where: { key: 'branding' },
      create: { key: 'branding', value: data },
      update: { value: data },
    });
    await audit(req.user.id, 'SETTINGS_UPDATE');
    return data;
  }
  @Get('audit') @Permit('audit.read') async logs(@Query() q: any) {
    const p = paging(q);
    const [items, total] = await db.$transaction([
      db.auditLog.findMany({
        skip: p.skip,
        take: p.take,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { fullName: true } } },
      }),
      db.auditLog.count(),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
  @Get('dashboard') @Permit('dashboard.read') async dashboard(@Req() req: any) {
    const faculty = { deletedAt: null };
    const admin = req.user.roleId === 'SUPER_ADMIN';
    const [
      totalFaculty,
      activeFaculty,
      totalUsers,
      activeUsers,
      totalDepartments,
      recentFaculty,
      academicRank,
      highestQualification,
      employmentStatus,
      department,
      recentFacultyCount,
    ] = await Promise.all([
      db.facultyMember.count({ where: faculty }),
      db.facultyMember.count({ where: { ...faculty, employmentStatus: 'نشط' } }),
      admin ? db.user.count() : null,
      admin ? db.user.count({ where: { active: true } }) : null,
      db.department.count(),
      db.facultyMember.findMany({
        where: faculty,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { department: true },
      }),
      db.facultyMember.groupBy({ by: ['academicRank'], where: faculty, _count: true }),
      db.facultyMember.groupBy({ by: ['highestQualification'], where: faculty, _count: true }),
      db.facultyMember.groupBy({ by: ['employmentStatus'], where: faculty, _count: true }),
      db.facultyMember.groupBy({ by: ['departmentId'], where: faculty, _count: true }),
      db.facultyMember.count({
        where: { ...faculty, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      }),
    ]);
    const departments = await db.department.findMany();
    return {
      totalFaculty,
      activeFaculty,
      totalUsers,
      activeUsers,
      totalDepartments,
      recentFaculty,
      recentFacultyCount,
      distributions: {
        academicRank,
        highestQualification,
        employmentStatus,
        department: department.map((d) => ({
          name: departments.find((x) => x.id === d.departmentId)?.name,
          _count: d._count,
        })),
      },
      activity: admin
        ? await db.auditLog.findMany({
            take: 6,
            orderBy: { createdAt: 'desc' },
            include: { actor: { select: { fullName: true } } },
          })
        : [],
    };
  }
}
