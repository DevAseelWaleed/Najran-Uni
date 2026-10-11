// Central institution defaults; deployment overrides belong in the root .env.
export function institutionIdentity() {
  const collegeName = process.env.COLLEGE_NAME || 'كلية الشريعة وأصول الدين';
  return {
    universityName: process.env.UNIVERSITY_NAME || 'جامعة نجران',
    collegeName,
    systemName: process.env.SYSTEM_NAME || 'الكشاف الأكاديمي لأعضاء هيئة التدريس بالكلية',
    homeTitle: process.env.HOME_TITLE || `الكشاف الأكاديمي لأعضاء هيئة التدريس ب${collegeName}`,
    primaryColor: process.env.PRIMARY_COLOR || '#315D90',
    accentColor: process.env.ACCENT_COLOR || '#E4B52E',
    logoUrl: '',
  };
}
