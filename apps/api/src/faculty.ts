import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { Permit } from './security';
import { parse, paging, facultySchema } from './validation';
import { audit } from './audit';
export function facultyWhere(q: any, allowDeleted = false): Prisma.FacultyMemberWhereInput {
  const where: Prisma.FacultyMemberWhereInput = {
    deletedAt: allowDeleted && q.deleted === 'true' ? { not: null } : null,
  };
  if (q.search)
    where.OR = [
      'fullName',
      'englishName',
      'employeeNumber',
      'email',
      'generalSpecialization',
      'specificSpecialization',
    ].map((key) => ({ [key]: { contains: String(q.search).slice(0, 200), mode: 'insensitive' } }));
  for (const key of [
    'collegeId',
    'departmentId',
    'highestQualification',
    'academicRank',
    'employmentStatus',
    'employmentType',
  ])
    if (q[key]) Object.assign(where, { [key]: String(q[key]) });
  if (q.graduationYear)
    where.graduationYear = parse(facultySchema.shape.graduationYear, q.graduationYear);
  if (q.appointmentFrom || q.appointmentTo) {
    const from = q.appointmentFrom ? new Date(q.appointmentFrom) : null;
    const to = q.appointmentTo ? new Date(`${q.appointmentTo}T23:59:59.999Z`) : null;
    if ((from && isNaN(+from)) || (to && isNaN(+to)))
      throw new BadRequestException('التاريخ غير صحيح');
    where.appointmentDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }
  return where;
}
export const facultyInclude = {
  college: true,
  department: true,
  documents: {
    where: { deletedAt: null },
    select: {
      id: true,
      originalName: true,
      mime: true,
      size: true,
      category: true,
      createdAt: true,
      uploader: { select: { fullName: true } },
    },
  },
} as const;
@Controller('faculty')
export class FacultyController {
  @Get() @Permit('faculty.read') async list(@Query() q: any, @Req() req: any) {
    const p = paging(q);
    const where = facultyWhere(q, req.user.roleId === 'SUPER_ADMIN');
    const orderBy = {
      [['fullName', 'employeeNumber', 'createdAt', 'academicRank', 'graduationYear'].includes(
        q.sort,
      )
        ? q.sort
        : 'createdAt']: q.direction === 'asc' ? 'asc' : 'desc',
    };
    const [items, total] = await db.$transaction([
      db.facultyMember.findMany({
        where,
        orderBy,
        skip: p.skip,
        take: p.take,
        include: facultyInclude,
      }),
      db.facultyMember.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
  @Get(':id') @Permit('faculty.read') async get(@Param('id') id: string, @Req() req: any) {
    return db.facultyMember.findFirstOrThrow({
      where: { id, ...(req.user.roleId !== 'SUPER_ADMIN' ? { deletedAt: null } : {}) },
      include: { ...facultyInclude, qualifications: true },
    });
  }
  @Post() @Permit('faculty.write') async create(@Body() body: unknown, @Req() req: any) {
    const data = parse(facultySchema, body);
    const { qualifications, ...fields } = data;
    const f = await db.facultyMember.create({
      data: { ...fields, qualifications: { create: qualifications } },
      include: { ...facultyInclude, qualifications: true },
    });
    await audit(req.user.id, 'FACULTY_CREATE', f.id);
    return f;
  }
  @Patch(':id') @Permit('faculty.write') async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const data = parse(facultySchema, body);
    const { qualifications, ...fields } = data;
    const f = await db.$transaction(async (tx) => {
      await tx.facultyMember.findFirstOrThrow({ where: { id, deletedAt: null } });
      return tx.facultyMember.update({
        where: { id },
        data: { ...fields, qualifications: { deleteMany: {}, create: qualifications } },
        include: { ...facultyInclude, qualifications: true },
      });
    });
    await audit(req.user.id, 'FACULTY_UPDATE', id, { fields: Object.keys(fields) });
    return f;
  }
  @Delete(':id') @Permit('faculty.delete') async remove(@Param('id') id: string, @Req() req: any) {
    const f = await db.facultyMember.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(req.user.id, 'FACULTY_DELETE', id);
    return { id: f.id };
  }
  @Post(':id/restore') @Permit('faculty.delete') async restore(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const f = await db.facultyMember.update({ where: { id }, data: { deletedAt: null } });
    await audit(req.user.id, 'FACULTY_RESTORE', id);
    return { id: f.id };
  }
}
