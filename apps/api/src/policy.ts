export const permissions = [
  'dashboard.read',
  'faculty.read',
  'faculty.write',
  'faculty.delete',
  'document.write',
  'data.import',
  'data.export',
  'users.manage',
  'settings.manage',
  'audit.read',
] as const;
export const roles: Record<string, readonly string[]> = {
  SUPER_ADMIN: permissions,
  STAFF: permissions.filter(
    (p) => !['faculty.delete', 'users.manage', 'settings.manage', 'audit.read'].includes(p),
  ),
  VIEWER: ['dashboard.read', 'faculty.read'],
};
export const ranks = ['أستاذ', 'أستاذ مشارك', 'أستاذ مساعد', 'محاضر', 'معيد'];
export const degrees = ['دكتوراه', 'ماجستير', 'بكالوريوس'];
export const statuses = ['نشط', 'إجازة', 'متقاعد', 'منتهية الخدمة'];
export const employmentTypes = ['دائم', 'متعاقد', 'زائر'];
export const userSelect = {
  id: true,
  fullName: true,
  username: true,
  email: true,
  roleId: true,
  active: true,
  createdAt: true,
  lastLogin: true,
} as const;
