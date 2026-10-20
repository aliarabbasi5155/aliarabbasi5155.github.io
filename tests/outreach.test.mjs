import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRecord, buildLink, parseBackup, mergeRecords, csv } from '../admin/outreach-core.mjs';

const sample = (extra = {}) => ({ id: 'r_0123456789abcdef', company: 'Private Company', recipient: 'Private Person <person@example.com>', role: 'AI Engineer', notes: 'Private notes', channel: 'resume', language: 'en', status: 'draft', createdAt: '2026-10-05T16:00:00.000Z', updatedAt: '2026-10-05T16:00:00.000Z', ...extra });

test('generated links carry only campaign labels and an opaque code, with both languages and a base path', () => {
    const record = validateRecord(sample());
    const url = new URL(buildLink(record, 'https://example.com/portfolio'));
    assert.equal(url.pathname, '/portfolio/');
    assert.deepEqual(Object.fromEntries(url.searchParams), { utm_source: 'cv', utm_medium: 'document', utm_campaign: 'job_search_2026', utm_content: record.id });
    for (const secret of [record.company, record.recipient, record.role, record.notes]) assert.ok(!url.href.includes(encodeURIComponent(secret)));
    assert.equal(new URL(buildLink(sample({ language: 'fa', channel: 'linkedin' }), 'https://example.com')).pathname, '/fa/');
});

test('backup validation is atomic and rejects invalid IDs, types and duplicates', () => {
    for (const changes of [{ id: 'person@example.com' }, { channel: '__proto__' }, { notes: null }, { status: 'opened' }, { createdAt: 'invalid' }]) {
        assert.throws(() => parseBackup(JSON.stringify({ version: 1, records: [sample(), sample(changes)] })));
    }
    assert.throws(() => parseBackup(JSON.stringify({ version: 1, records: [sample(), sample()] })));
    assert.throws(() => parseBackup(JSON.stringify({ version: 2, records: [] })));
    const [record] = parseBackup(JSON.stringify({ version: 1, records: [sample({ url: 'https://evil.example', html: '<script>evil()</script>' })] }));
    assert.equal(record.url, undefined);
    assert.equal(record.html, undefined);
});

test('restore keeps newer local edits, updates older matching entries and preserves other sends', () => {
    const existing = sample({ updatedAt: '2026-10-06T16:00:00.000Z', notes: 'New local notes' });
    const other = sample({ id: 'r_fedcba9876543210' });
    assert.deepEqual(mergeRecords([existing], [sample(), other]), [existing, other]);
    const newest = sample({ updatedAt: '2026-10-07T16:00:00.000Z', notes: 'Latest notes' });
    assert.deepEqual(mergeRecords([existing, other], [newest]), [newest, other]);
});

test('CSV escapes commas, quotes, newlines, Persian text and spreadsheet formulas', () => {
    const output = csv([sample({ company: '=HYPERLINK("evil")', notes: 'فارسی,\n"quoted"', recipient: ' +SUM(1,2)' })], 'https://example.com');
    assert.ok(output.startsWith('\uFEFF'));
    assert.ok(output.includes('"\'=HYPERLINK(""evil"")"'));
    assert.ok(output.includes('"\' +SUM(1,2)"'));
    assert.ok(output.includes('"فارسی,\n""quoted"""'));
});
