import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../analytics.js', import.meta.url), 'utf8');
const CONSENT = 'portfolio.analytics.consent';
const OWNER = 'portfolio.analytics.owner';
const OUTREACH = 'portfolio.analytics.outreach';

function harness({ url = 'https://aliarabbasi5155.github.io/', consent = 'granted', owner = false, gpc = false, focused = true, sessionValues = {} } = {}) {
    let now = 0;
    let hasFocus = focused;
    let sectionName = 'blog';
    const timers = [];
    const tags = [];
    const storage = values => {
        const map = new Map(Object.entries(values));
        return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
    };
    const element = () => Object.assign(new EventTarget(), { hidden: true, focus() {}, getBoundingClientRect() { return { top: 0, bottom: 1200, height: 1200 }; } });
    const sections = Object.fromEntries(['blog', 'projects', 'experience'].map(name => [name, Object.assign(element(), { id: name })]));
    const content = element();
    content.getBoundingClientRect = () => ({ top: 0, bottom: 800, height: 800 });
    const allow = Object.assign(element(), { dataset: { analyticsChoice: 'granted' } });
    const deny = Object.assign(element(), { dataset: { analyticsChoice: 'denied' } });
    const panel = element();
    panel.querySelectorAll = () => [allow, deny];
    panel.querySelector = () => deny;
    const settings = element();
    const languageLink = { href: 'https://aliarabbasi5155.github.io/fa/' };
    const document = Object.assign(new EventTarget(), {
        currentScript: { dataset: { hosts: '["aliarabbasi5155.github.io"]', measurementIds: '["G-M1XGN1K27Z","G-SN7JFYP48S"]' } },
        head: { appendChild(tag) { tags.push(tag); } },
        documentElement: { lang: 'en' }, referrer: 'https://linkedin.com/in/private-name?email=person@example.com',
        visibilityState: 'visible', cookie: '', hasFocus: () => hasFocus,
        createElement: () => ({}),
        querySelectorAll: query => query === '.lang-link' ? [languageLink] : [],
        querySelector: query => query === '.tab-contents' ? content : query === '.tab-content.active' ? sections[sectionName] : null,
        getElementById: id => ({ 'analytics-consent': panel, 'analytics-settings': settings, ...sections })[id],
    });
    const window = Object.assign(new EventTarget(), {
        innerHeight: 800, localStorage: storage({ ...(consent ? { [CONSENT]: consent } : {}), ...(owner ? { [OWNER]: '1' } : {}) }),
        sessionStorage: storage(sessionValues), setInterval: callback => timers.push(callback),
    });
    vm.runInNewContext(source, { window, document, location: new URL(url), navigator: { globalPrivacyControl: gpc }, performance: { now: () => now }, getComputedStyle: () => ({ overflowY: 'auto' }), URL, URLSearchParams, Date, Map, Set });
    const commands = () => Array.from(window.dataLayer || [], args => Array.from(args));
    const events = name => commands().filter(args => args[0] === 'event' && (!name || args[1] === name));
    const dispatch = (target, type, extra = {}) => {
        const event = new Event(type);
        Object.assign(event, extra);
        target.dispatchEvent(event);
    };
    return {
        window, document, tags, panel, settings, languageLink, commands, events,
        advance(ms) { for (let remaining = ms; remaining > 0;) { const step = Math.min(1000, remaining); now += step; remaining -= step; timers.forEach(callback => callback()); } },
        choose(value) { dispatch(value === 'granted' ? allow : deny, 'click'); },
        section(value) { sectionName = value; dispatch(document, 'portfolio:section', { detail: { section: value } }); },
        visibility(value) { document.visibilityState = value; dispatch(document, 'visibilitychange'); },
        focus(value) { hasFocus = value; dispatch(window, value ? 'focus' : 'blur'); },
        activity() { dispatch(document, 'pointerdown'); },
        leave() { dispatch(window, 'pagehide'); },
    };
}

test('clone hosts, owner browsers and privacy signals never load or send to Google', () => {
    for (const options of [{ url: 'https://friend.github.io/' }, { owner: true }, { gpc: true }]) {
        const page = harness(options);
        page.advance(30000);
        assert.equal(page.tags.length, 0);
        assert.equal(page.commands().length, 0);
        assert.equal(page.settings.hidden, true);
    }
});

test('consent is required, asked only from Privacy settings; accepting uses one loader and configures each destination exactly once', () => {
    const page = harness({ consent: null });
    assert.equal(page.panel.hidden, true);
    assert.equal(page.settings.hidden, false);
    page.advance(30000);
    assert.equal(page.tags.length, 0);
    page.settings.dispatchEvent(new Event('click'));
    assert.equal(page.panel.hidden, false);
    page.choose('granted');
    assert.equal(page.panel.hidden, true);
    assert.equal(page.tags.length, 1);
    assert.deepEqual(page.commands().filter(args => args[0] === 'config').map(args => args[1]), ['G-M1XGN1K27Z', 'G-SN7JFYP48S']);
    assert.deepEqual(Array.from(page.events('section_view')[0][2].send_to), ['G-M1XGN1K27Z', 'G-SN7JFYP48S']);
    page.choose('denied');
    const before = page.events().length;
    page.advance(30000);
    page.activity();
    assert.equal(page.events().length, before);
    assert.equal(page.window['ga-disable-G-M1XGN1K27Z'], true);
    page.choose('granted');
    assert.equal(page.tags.length, 1);
    assert.equal(page.commands().filter(args => args[0] === 'config').length, 2);
});

test('hidden and unfocused time is excluded, and tab switches flush the correct section', () => {
    const page = harness();
    page.advance(5000);
    page.visibility('hidden');
    page.advance(20000);
    page.visibility('visible');
    page.activity();
    page.advance(5000);
    page.focus(false);
    page.advance(20000);
    page.focus(true);
    page.section('projects');
    page.advance(10000);
    page.leave();
    const sums = {};
    for (const [, , event] of page.events('section_attention')) sums[event.section_name] = (sums[event.section_name] || 0) + event.active_seconds;
    assert.deepEqual(sums, { blog: 10, projects: 10 });
    assert.equal(page.events('section_engaged').filter(event => event[2].section_name === 'projects' && event[2].milestone_seconds === 10).length, 1);
});

test('idle reading stops at 60 seconds and milestones are not duplicated on returning to a section', () => {
    const page = harness();
    page.advance(180000);
    page.leave();
    assert.equal(page.events('section_attention').reduce((sum, event) => sum + event[2].active_seconds, 0), 60);
    assert.deepEqual(page.events('section_engaged').map(event => event[2].milestone_seconds), [10, 30, 60]);
    page.section('projects');
    page.section('blog');
    page.advance(10000);
    assert.equal(page.events('section_engaged').filter(event => event[2].milestone_seconds === 10 && event[2].section_name === 'blog').length, 1);
});

test('an unfocused initial page does not claim a section was seen', () => {
    const page = harness({ focused: false });
    page.advance(5000);
    assert.equal(page.events('section_view').length, 0);
    page.focus(true);
    page.advance(1000);
    assert.equal(page.events('section_view').length, 1);
});

test('only safe UTM labels and opaque IDs reach Google; locale navigation retains attribution', () => {
    const id = 'r_0123456789abcdef';
    const page = harness({ url: 'https://aliarabbasi5155.github.io/?utm_source=linkedin&utm_medium=social&utm_campaign=job_search_2026&utm_content=' + id + '&email=private@example.com&recipient=PrivatePerson#secret' });
    const params = page.events('section_view')[0][2];
    assert.equal(params.outreach_id, id);
    assert.ok(!JSON.stringify(page.commands()).includes('private@example.com'));
    assert.ok(!JSON.stringify(page.commands()).includes('PrivatePerson'));
    assert.equal(params.page_referrer, 'https://linkedin.com/');
    assert.equal(new URL(page.languageLink.href).searchParams.get('utm_content'), id);
    const locale = harness({ url: 'https://aliarabbasi5155.github.io/fa/', sessionValues: { [OUTREACH]: id } });
    assert.equal(locale.events('section_view')[0][2].outreach_id, id);
    const invalid = harness({ url: 'https://aliarabbasi5155.github.io/?utm_content=person@example.com', sessionValues: { [OUTREACH]: id } });
    assert.equal(invalid.events('section_view')[0][2].outreach_id, undefined);
});
