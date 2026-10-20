export const STORAGE_KEY = 'portfolio.outreach.records.v1';
export const TOKEN_PATTERN = /^r_[a-f0-9]{16}$/;
export const CHANNELS = {
    resume: { source: 'cv', medium: 'document', label: 'رزومه / PDF' },
    linkedin: { source: 'linkedin', medium: 'social', label: 'لینکدین' },
    email: { source: 'email', medium: 'email', label: 'ایمیل' },
    other: { source: 'outreach', medium: 'referral', label: 'ارسال مستقیم' },
};
export const STATUSES = { draft: 'آمادهٔ ارسال', sent: 'ارسال شده', replied: 'پاسخ گرفته', interview: 'مصاحبه', closed: 'بسته شده' };

function text(value, limit, required = false) {
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error('اطلاعات لینک ناقص است یا بیش از حد طولانی است.');
    return value.trim();
}

export function validateRecord(value) {
    if (!value || typeof value !== 'object' || !TOKEN_PATTERN.test(value.id)) throw new Error('کد لینک معتبر نیست.');
    if (!Object.hasOwn(CHANNELS, value.channel) || !Object.hasOwn(STATUSES, value.status) || !['en', 'fa'].includes(value.language)) throw new Error('نوع ارسال، زبان یا وضعیت معتبر نیست.');
    for (const key of ['createdAt', 'updatedAt']) {
        if (typeof value[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value[key]) || !Number.isFinite(Date.parse(value[key]))) throw new Error('تاریخ لینک معتبر نیست.');
    }
    // Only known fields survive import. Imported URLs and HTML are never used.
    return {
        id: value.id, company: text(value.company, 140, true),
        recipient: text(value.recipient, 140), role: text(value.role, 160),
        notes: text(value.notes, 2000), channel: value.channel, language: value.language,
        status: value.status, createdAt: value.createdAt, updatedAt: value.updatedAt,
    };
}

export function buildLink(record, base) {
    const root = new URL(base);
    if (!/^https?:$/.test(root.protocol)) throw new Error('آدرس سایت معتبر نیست.');
    const url = new URL(root.pathname.replace(/\/$/, '') + (record.language === 'fa' ? '/fa/' : '/'), root.origin);
    const channel = CHANNELS[record.channel];
    url.searchParams.set('utm_source', channel.source);
    url.searchParams.set('utm_medium', channel.medium);
    url.searchParams.set('utm_campaign', 'job_search_' + record.createdAt.slice(0, 4));
    url.searchParams.set('utm_content', record.id);
    return url.href;
}

export function parseBackup(raw) {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.records) || data.records.length > 5000) throw new Error('فایل پشتیبان این ابزار نیست یا بیش از ۵۰۰۰ لینک دارد.');
    const records = data.records.map(validateRecord);
    if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('کد تکراری در فایل پشتیبان وجود دارد.');
    return records;
}

export function mergeRecords(existing, imported) {
    const merged = new Map(existing.map(record => [record.id, record]));
    for (const record of imported) {
        const previous = merged.get(record.id);
        if (!previous || Date.parse(record.updatedAt) > Date.parse(previous.updatedAt)) merged.set(record.id, record);
    }
    if (merged.size > 5000) throw new Error('حداکثر ۵۰۰۰ لینک قابل نگهداری است.');
    return [...merged.values()];
}

export function csv(records, base) {
    // Protect spreadsheet imports from formulas in private notes/recipient names.
    const cell = value => {
        let string = String(value ?? '');
        if (/^[\s]*[=+@-]/.test(string) || /^[\t\r\n]/.test(string)) string = "'" + string;
        return '"' + string.replaceAll('"', '""') + '"';
    };
    const rows = [['id', 'company', 'recipient', 'role', 'channel', 'language', 'status', 'created_at', 'url', 'notes']];
    for (const record of records) rows.push([record.id, record.company, record.recipient, record.role, record.channel, record.language, record.status, record.createdAt, buildLink(record, base), record.notes]);
    return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
