// Canonical numbers: India is stored as 10 national digits; USA/Canada/Australia are stored in E.164 ("+1…", "+61…").
export const normalizePhone = v => { let t = String(v || '').replace(/[\s()\-\u00a0]/g, ''); if (t.startsWith('00')) t = '+' + t.slice(2); return t; };
export const isStaffPhone = v => /^(\+[1-9][0-9]{7,14}|[6-9][0-9]{9})$/.test(normalizePhone(v));
export const isIndianPhone = v => /^[6-9][0-9]{9}$/.test(normalizePhone(v));
// Never prepend +91 to a value that already carries its country code.
export const phoneDisplay = v => { const t = normalizePhone(v); return !t ? '—' : t.startsWith('+') ? t : `+91 ${t}`; };
// Keeps "+" and digits only while typing (international) or digits only (Indian national form).
export const typedPhone = v => v.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
