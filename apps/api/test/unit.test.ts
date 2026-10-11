import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { otp, otpHash, hash, equal } from '../src/crypto';
import { facultySchema, userSchema, passwordSchema } from '../src/validation';
import { roles, permissions } from '../src/policy';
import { detectMime } from '../src/storage';
import { safeCell, escapeHtml, workbook } from '../src/exports';
import ExcelJS from 'exceljs';
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
describe('security and validation', () => {
  it('six-digit random OTP and keyed storage', () => {
    for (let i = 0; i < 100; i++) expect(otp()).toMatch(/^\d{6}$/);
    expect(otpHash('a', '123456')).not.toBe(otpHash('b', '123456'));
    expect(equal(hash('a'), hash('b'))).toBe(false);
    expect(equal(hash('a'), hash('a'))).toBe(true);
  });
  it('role boundaries', () => {
    expect(roles.SUPER_ADMIN).toEqual(permissions);
    for (const p of ['users.manage', 'settings.manage', 'faculty.delete', 'audit.read'])
      expect(roles.STAFF).not.toContain(p);
    for (const p of ['faculty.write', 'data.export', 'data.import', 'document.write'])
      expect(roles.VIEWER).not.toContain(p);
  });
  it('rejects missing fields, invalid emails and weak passwords', () => {
    expect(facultySchema.safeParse({}).success).toBe(false);
    expect(
      userSchema.safeParse({
        fullName: 'Admin',
        username: 'admin',
        email: 'bad',
        roleId: 'SUPER_ADMIN',
      }).success,
    ).toBe(false);
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('StrongPassword123!').success).toBe(true);
  });
  it('file signatures and formula injection', () => {
    expect(detectMime(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(() => detectMime(Buffer.from('<script>'))).toThrow();
    expect(safeCell('=HYPERLINK("bad")')).toMatch(/^'/);
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });
  it('Arabic XLSX output is a real workbook', async () => {
    const buffer = await workbook([
      { employeeNumber: '10', fullName: 'أحمد', email: '=evil', academicRank: 'أستاذ' },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    expect(wb.worksheets[0].getCell('B2').value).toBe('أحمد');
    expect(wb.worksheets[0].getCell('C2').value).toBe("'=evil");
    expect(wb.worksheets[0].views[0].rightToLeft).toBe(true);
  });
});
