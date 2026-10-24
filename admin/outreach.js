import { STORAGE_KEY, CHANNELS, STATUSES, validateRecord, buildLink, parseBackup, mergeRecords, csv } from './outreach-core.mjs';

const OWNER_KEY = 'portfolio.analytics.owner';
const $ = selector => document.querySelector(selector);
const form = $('#link-form');
const notice = $('#notice');
let siteUrl = document.body.dataset.siteUrl;
try { new URL(siteUrl); } catch { siteUrl = 'https://aliarabbasi5155.github.io'; }
let records = [];
let editingId = null;
let resultId = null;
let damagedRaw = null;
let store;
try { store = window.localStorage; } catch {}

function announce(message, error = false) {
    notice.textContent = message;
    notice.classList.toggle('error', error);
    notice.hidden = false;
}

try {
    const raw = store?.getItem(STORAGE_KEY);
    if (raw) {
        try { records = parseBackup(raw); }
        catch { damagedRaw = raw; $('#save-link').disabled = true; announce('فهرست ذخیره‌شده قابل خواندن نیست. پشتیبان JSON دادهٔ فعلی را بگیر؛ سپس یک پشتیبان معتبر بازیابی کن. دادهٔ فعلی بازنویسی نشده است.', true); }
    }
    // Admin use is excluded from portfolio analytics in this browser.
    store?.setItem(OWNER_KEY, '1');
} catch { announce('ذخیره‌سازی مرورگر در دسترس نیست. لینک‌ها در این صفحه ساخته می‌شوند، اما قبل از بستن صفحه پشتیبان JSON بگیر.', true); }

function persist(next, restoring = false) {
    if (damagedRaw && !restoring) throw new Error('ابتدا یک پشتیبان معتبر بازیابی کن.');
    records = next;
    if (restoring) { damagedRaw = null; $('#save-link').disabled = false; }
    try {
        if (!store) throw new Error();
        store.setItem(STORAGE_KEY, JSON.stringify({ version: 1, records }));
        return true;
    } catch {
        announce('تغییر فقط در حافظهٔ این صفحه است؛ ذخیره‌سازی مرورگر ممکن نشد. برای حفظ آن همین حالا پشتیبان JSON بگیر.', true);
        return false;
    }
}

function randomId() {
    let id;
    do {
        const bytes = crypto.getRandomValues(new Uint8Array(8));
        id = 'r_' + [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    } while (records.some(record => record.id === id));
    return id;
}

async function copy(value) {
    try {
        await navigator.clipboard.writeText(value);
        announce('کپی شد.');
    } catch {
        const field = document.createElement('textarea');
        field.value = value;
        field.dir = 'ltr';
        document.body.appendChild(field);
        field.select();
        let copied = false;
        try { copied = document.execCommand('copy'); } catch {}
        field.remove();
        if (copied) announce('کپی شد.');
        else { $('#result-url').value = value; $('#created-link').hidden = false; $('#result-url').focus(); $('#result-url').select(); announce('کپی خودکار ممکن نشد. متن انتخاب شده را با Cmd/Ctrl+C کپی کن.', true); }
    }
}

function download(content, type, extension) {
    const href = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = href;
    link.download = 'portfolio-links-' + new Date().toISOString().slice(0, 10) + '.' + extension;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
}

function resetForm() {
    editingId = null;
    form.reset();
    $('#form-title').textContent = 'لینک جدید';
    $('#save-link').textContent = 'ساخت و ذخیرهٔ لینک';
    $('#cancel-edit').hidden = true;
}

function showResult(record) {
    resultId = record.id;
    $('#result-url').value = buildLink(record, siteUrl);
    $('#created-link').hidden = false;
}

function edit(record) {
    editingId = record.id;
    for (const name of ['company', 'recipient', 'role', 'channel', 'language', 'notes']) form.elements.namedItem(name).value = record[name];
    $('#form-title').textContent = 'ویرایش ارسال';
    $('#save-link').textContent = 'ذخیرهٔ تغییرات';
    $('#cancel-edit').hidden = false;
    showResult(record);
    form.elements.namedItem('company').focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function render() {
    const query = $('#search').value.trim().toLocaleLowerCase();
    const visible = records.filter(record => [record.company, record.recipient, record.role, record.notes, record.id].join(' ').toLocaleLowerCase().includes(query))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const target = $('#records');
    target.replaceChildren();
    $('#record-count').textContent = records.length.toLocaleString('fa-IR') + ' لینک';
    $('#empty-state').hidden = visible.length > 0;
    $('#empty-state').textContent = records.length ? 'لینکی با این جست‌وجو پیدا نشد.' : 'هنوز لینکی ذخیره نشده. اولین ارسال را از فرم کنار صفحه بساز.';
    for (const record of visible) {
        const node = $('#record-template').content.cloneNode(true);
        node.querySelector('h3').textContent = record.company;
        node.querySelector('.record-description').textContent = [record.recipient, record.role].filter(Boolean).join(' · ');
        node.querySelector('.record-id').textContent = record.id;
        node.querySelector('.record-date').textContent = new Date(record.createdAt).toLocaleDateString('fa-IR');
        node.querySelector('.record-channel').textContent = CHANNELS[record.channel].label + ' · ' + ({ en: 'English', it: 'Italiano', fa: 'فارسی' }[record.language]);
        node.querySelector('.record-notes').textContent = record.notes;
        const status = node.querySelector('.record-status');
        status.setAttribute('aria-label', 'وضعیت ' + record.company);
        for (const [value, label] of Object.entries(STATUSES)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            status.appendChild(option);
        }
        status.value = record.status;
        status.addEventListener('change', () => {
            const next = records.map(item => item.id === record.id ? { ...item, status: status.value, updatedAt: new Date().toISOString() } : item);
            if (persist(next)) announce('وضعیت ارسال ذخیره شد.');
            render();
        });
        for (const button of node.querySelectorAll('[data-action]')) {
            button.addEventListener('click', () => {
                switch (button.dataset.action) {
                    case 'copy': showResult(record); copy(buildLink(record, siteUrl)); break;
                    case 'code': copy(record.id); break;
                    case 'edit': edit(record); break;
                    case 'delete':
                        if (!window.confirm('یادداشت این ارسال حذف شود؟ لینک ارسال‌شده همچنان کار می‌کند.')) return;
                        if (persist(records.filter(item => item.id !== record.id))) announce('ارسال از فهرست محلی حذف شد.');
                        if (editingId === record.id) resetForm();
                        if (resultId === record.id) { resultId = null; $('#created-link').hidden = true; }
                        render();
                        break;
                }
            });
        }
        target.appendChild(node);
    }
}

form.addEventListener('submit', event => {
    event.preventDefault();
    try {
        if (!editingId && records.length >= 5000) throw new Error('حداکثر ۵۰۰۰ لینک قابل نگهداری است.');
        const fields = Object.fromEntries(new FormData(form));
        const previous = records.find(record => record.id === editingId);
        const now = new Date().toISOString();
        const record = validateRecord({ ...fields, id: previous?.id || randomId(), status: previous?.status || 'draft', createdAt: previous?.createdAt || now, updatedAt: now });
        const next = previous ? records.map(item => item.id === record.id ? record : item) : [...records, record];
        if (persist(next)) announce(previous ? 'تغییرات ذخیره شد؛ کد ارسال ثابت ماند.' : 'لینک ساخته و در همین مرورگر ذخیره شد.');
        resetForm();
        showResult(record);
        render();
    } catch (error) { announce(error.message, true); }
});
$('#cancel-edit').addEventListener('click', resetForm);
$('#search').addEventListener('input', render);
$('#copy-result').addEventListener('click', () => copy($('#result-url').value));
$('#copy-result-id').addEventListener('click', () => { if (resultId) copy(resultId); });
$('#export-json').addEventListener('click', () => download(damagedRaw || JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records }, null, 2), 'application/json;charset=utf-8', 'json'));
$('#export-csv').addEventListener('click', () => download(csv(records, siteUrl), 'text/csv;charset=utf-8', 'csv'));
$('#import-json').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
        if (file.size > 15 * 1024 * 1024) throw new Error('فایل پشتیبان بیش از حد بزرگ است.');
        const imported = parseBackup(await file.text());
        const next = mergeRecords(records, imported);
        if (persist(next, true)) announce('پشتیبان بازیابی شد. لینک‌های موجود حفظ شدند؛ برای کدهای مشترک، نسخهٔ جدیدتر نگه داشته شد.');
        resetForm();
        $('#created-link').hidden = true;
        render();
    } catch (error) { announce('بازیابی انجام نشد: ' + error.message, true); }
    event.target.value = '';
});

function showOwnerStatus() {
    let excluded = false;
    try { excluded = store?.getItem(OWNER_KEY) === '1'; } catch {}
    $('#owner-toggle').textContent = excluded ? 'این مرورگر از آمار مستثناست · فعال کردن آمار برای تست' : 'این مرورگر در آمار شمرده می‌شود · مستثنا کردن';
}
$('#owner-toggle').addEventListener('click', () => {
    try {
        if (!store) throw new Error();
        if (store.getItem(OWNER_KEY) === '1') store.removeItem(OWNER_KEY);
        else store.setItem(OWNER_KEY, '1');
        showOwnerStatus();
        announce('تنظیم این مرورگر تغییر کرد. برای تست، صفحهٔ سایت را دوباره بارگذاری کن.');
    } catch { announce('تنظیم مرورگر ذخیره نشد.', true); }
});
showOwnerStatus();
render();
