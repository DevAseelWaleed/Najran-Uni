import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { degrees, ranks, statuses, employmentTypes } from './policy';
z.setErrorMap(() => ({ message: 'قيمة غير صحيحة أو حقل مطلوب' }));
const text = z.string().trim().min(1, 'هذا الحقل مطلوب').max(200);
const optional = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => v || null);
const date = z
  .preprocess((v) => (v === '' || v == null ? null : v), z.coerce.date().nullable())
  .refine((v) => !v || v.getFullYear() >= 1900, 'التاريخ غير صحيح');
const year = z.preprocess(
  (v) => (v === '' || v == null ? null : Number(v)),
  z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1)
    .nullable(),
);
export const facultySchema = z
  .object({
    employeeNumber: text,
    fullName: text,
    englishName: optional,
    gender: z.enum(['ذكر', 'أنثى']).nullable().optional(),
    birthDate: date.refine((v) => !v || v < new Date(), 'تاريخ الميلاد غير صحيح'),
    nationality: optional,
    mobile: z
      .string()
      .regex(/^\+?[\d\s-]{7,20}$/, 'رقم الجوال غير صحيح')
      .nullable()
      .optional()
      .or(z.literal(''))
      .transform((v) => v || null),
    email: z
      .string()
      .trim()
      .email('البريد الإلكتروني غير صحيح')
      .max(254)
      .transform((v) => v.toLowerCase()),
    collegeId: z.string().uuid(),
    departmentId: z.string().uuid(),
    highestQualification: z.string().refine((v) => degrees.includes(v), 'المؤهل غير معروف'),
    academicRank: z.string().refine((v) => ranks.includes(v), 'الرتبة غير معروفة'),
    generalSpecialization: optional,
    specificSpecialization: optional,
    awardingUniversity: optional,
    awardingCountry: optional,
    graduationYear: year,
    researchInterests: optional,
    jobTitle: optional,
    appointmentDate: date,
    joiningDate: date,
    employmentType: z.string().refine((v) => employmentTypes.includes(v), 'نوع التوظيف غير معروف'),
    employmentStatus: z.string().refine((v) => statuses.includes(v), 'الحالة غير معروفة'),
    administrativePosition: optional,
    officeNumber: optional,
    officePhone: optional,
    qualifications: z
      .array(z.object({ degree: text, university: text, country: optional, year }))
      .max(20)
      .default([]),
  })
  .strict();
export const userSchema = z
  .object({
    fullName: text,
    username: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_.-]{3,50}$/, 'اسم المستخدم غير صحيح')
      .transform((v) => v.toLowerCase()),
    email: z
      .string()
      .trim()
      .email('البريد غير صحيح')
      .max(254)
      .transform((v) => v.toLowerCase()),
    roleId: z.enum(['SUPER_ADMIN', 'STAFF', 'VIEWER']),
    active: z.boolean().default(true),
  })
  .strict();
export const passwordSchema = z
  .string()
  .min(12, 'كلمة المرور لا تقل عن 12 حرفًا')
  .max(128)
  .regex(/[a-zA-Z]/, 'أضف حرفًا لاتينيًا')
  .regex(/\d/, 'أضف رقمًا');
export function parse<T>(schema: z.ZodType<T, any, any>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('؛ '),
    );
  return result.data;
}
export function paging(q: Record<string, any>) {
  const page = Math.max(1, Math.min(100000, Math.trunc(Number(q.page)) || 1));
  const pageSize = [10, 25, 50].includes(Number(q.pageSize)) ? Number(q.pageSize) : 10;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
