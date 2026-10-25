/* One Google tag, two independent destinations. Nothing loads on clone hosts,
   in the owner's browser, or before the visitor opts in. */
(() => {
    'use strict';
    const script = document.currentScript;
    let hosts, ids;
    try {
        hosts = JSON.parse(script.dataset.hosts);
        ids = JSON.parse(script.dataset.measurementIds).filter(id => /^G-[A-Z0-9]+$/.test(id));
    } catch { return; }
    if (!hosts.includes(location.hostname) || !ids.length) return;

    const CONSENT_KEY = 'portfolio.analytics.consent';
    const OWNER_KEY = 'portfolio.analytics.owner';
    const OUTREACH_KEY = 'portfolio.analytics.outreach';
    const TOKEN = /^r_[a-f0-9]{16}$/;
    const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
    const write = (storage, key, value) => { try { storage.setItem(key, value); } catch {} };
    const remove = (storage, key) => { try { storage.removeItem(key); } catch {} };
    // Access to the storage objects themselves can also throw in restricted browsers.
    let local, session;
    try { local = window.localStorage; session = window.sessionStorage; } catch {}
    if (read(local, OWNER_KEY) === '1' || navigator.globalPrivacyControl === true) return;

    const campaignRules = {
        utm_source: /^(cv|linkedin|email|outreach)$/,
        utm_medium: /^(document|social|email|referral)$/,
        utm_campaign: /^job_search_\d{4}$/,
        utm_content: TOKEN,
    };
    const incoming = new URL(location.href);
    const campaign = new URLSearchParams();
    for (const [key, rule] of Object.entries(campaignRules)) {
        const value = incoming.searchParams.get(key);
        if (value && rule.test(value)) campaign.set(key, value);
    }
    // Keep the same campaign when the visitor switches languages, even before consent.
    for (const link of document.querySelectorAll('.lang-link')) {
        const url = new URL(link.href, location.href);
        for (const [key, value] of campaign) url.searchParams.set(key, value);
        link.href = url.href;
    }
    const cleanLocation = new URL(incoming.pathname, incoming.origin);
    cleanLocation.search = campaign.toString();
    let cleanReferrer = '';
    try {
        const referrer = new URL(document.referrer);
        cleanReferrer = referrer.origin + '/';
    } catch {}

    const panel = document.getElementById('analytics-consent');
    const settings = document.getElementById('analytics-settings');
    if (!panel || !settings) return;
    settings.hidden = false;
    let enabled = false;
    let initialized = false;
    let outreachId = '';
    let currentSection = '';
    let lastTick = performance.now();
    let lastActivity = lastTick;
    let wasEligible = false;
    let sectionViewed = false;
    let lastReport = lastTick;
    const attention = new Map();
    const IDLE_MS = 60000;
    const MILESTONES = [10, 30, 60, 120];
    const content = document.querySelector('.tab-contents');

    function stats() {
        if (!attention.has(currentSection)) {
            attention.set(currentSection, { total: 0, pending: 0, milestones: new Set(), depth: 0 });
        }
        return attention.get(currentSection);
    }

    function visibleBounds() {
        const section = document.getElementById(currentSection);
        if (!section || !content) return null;
        const rect = section.getBoundingClientRect();
        const viewport = content.getBoundingClientRect();
        const scrolls = getComputedStyle(content).overflowY === 'auto';
        const top = Math.max(0, rect.top, scrolls ? viewport.top : 0);
        const bottom = Math.min(window.innerHeight, rect.bottom, scrolls ? viewport.bottom : window.innerHeight);
        return { rect, top, bottom };
    }

    function eligible(now) {
        if (!enabled || document.visibilityState !== 'visible' || !document.hasFocus() || now - lastActivity >= IDLE_MS) return false;
        const bounds = visibleBounds();
        return Boolean(bounds && bounds.bottom - bounds.top >= Math.min(60, bounds.rect.height));
    }

    function emit(name, parameters = {}) {
        if (!enabled) return;
        window.gtag('event', name, {
            send_to: ids,
            page_location: cleanLocation.href,
            page_referrer: cleanReferrer,
            page_language: document.documentElement.lang || 'en',
            section_name: currentSection,
            ...(outreachId ? { outreach_id: outreachId } : {}),
            ...parameters,
            transport_type: 'beacon',
        });
    }

    function flush() {
        if (!currentSection) return;
        const state = stats();
        if (state.pending < 1000) return;
        emit('section_attention', { active_seconds: Math.round(state.pending) / 1000 });
        state.pending = 0;
    }

    function tick() {
        const now = performance.now();
        if (currentSection && enabled && wasEligible) {
            // Cap stalled timers: a sleeping computer is not reading time.
            const delta = Math.max(0, Math.min(2000, Math.min(now, lastActivity + IDLE_MS) - lastTick));
            const state = stats();
            state.total += delta;
            state.pending += delta;
            for (const seconds of MILESTONES) {
                if (state.total >= seconds * 1000 && !state.milestones.has(seconds)) {
                    state.milestones.add(seconds);
                    emit('section_engaged', { milestone_seconds: seconds });
                }
            }
        }
        lastTick = now;
        wasEligible = eligible(now);
        if (wasEligible && currentSection) {
            if (!sectionViewed) {
                sectionViewed = true;
                emit('section_view');
            }
            const state = stats();
            const bounds = visibleBounds();
            if (state.total >= 1000 && bounds.rect.height > 0) {
                const percent = Math.min(100, Math.floor((bounds.bottom - bounds.rect.top) / bounds.rect.height * 100));
                const depth = [100, 75, 50, 25].find(value => percent >= value) || 0;
                if (depth > state.depth) {
                    state.depth = depth;
                    emit('section_depth', { percent_scrolled: depth });
                }
            }
        }
        if (now - lastReport >= 15000) {
            flush();
            lastReport = now;
        }
    }

    function start() {
        if (enabled) return;
        enabled = true;
        for (const id of ids) window['ga-disable-' + id] = false;
        lastTick = lastActivity = lastReport = performance.now();
        currentSection = document.querySelector('.tab-content.active')?.id || '';
        wasEligible = false;
        const hasIncomingCampaign = [...incoming.searchParams.keys()].some(key => key.startsWith('utm_'));
        outreachId = campaign.get('utm_content') || (hasIncomingCampaign ? '' : read(session, OUTREACH_KEY)) || '';
        if (!TOKEN.test(outreachId)) outreachId = '';
        if (outreachId) write(session, OUTREACH_KEY, outreachId);
        else remove(session, OUTREACH_KEY);
        if (!initialized) {
            initialized = true;
            window.dataLayer = window.dataLayer || [];
            window.gtag = function () { window.dataLayer.push(arguments); };
            window.gtag('consent', 'default', {
                analytics_storage: 'granted', ad_storage: 'denied',
                ad_user_data: 'denied', ad_personalization: 'denied',
            });
            window.gtag('js', new Date());
            window.gtag('set', {
                page_location: cleanLocation.href, page_referrer: cleanReferrer,
                page_language: document.documentElement.lang || 'en',
                ...(outreachId ? { outreach_id: outreachId } : {}),
            });
            for (const id of ids) {
                window.gtag('config', id, {
                    allow_google_signals: false, allow_ad_personalization_signals: false,
                    ...(incoming.searchParams.get('analytics_debug') === '1' ? { debug_mode: true } : {}),
                });
            }
            const tag = document.createElement('script');
            tag.async = true;
            tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + ids[0];
            document.head.appendChild(tag);
        } else {
            window.gtag('consent', 'update', { analytics_storage: 'granted' });
            window.gtag('set', { outreach_id: outreachId });
        }
        tick();
    }

    function stop() {
        // Stop before updating consent, so no post-withdrawal event is sent.
        enabled = false;
        wasEligible = false;
        attention.clear();
        sectionViewed = false;
        remove(session, OUTREACH_KEY);
        outreachId = '';
        for (const id of ids) window['ga-disable-' + id] = true;
        if (initialized) {
            window.gtag('consent', 'update', { analytics_storage: 'denied' });
            window.gtag('set', { outreach_id: '' });
        }
        // Remove this site's GA cookies when consent is withdrawn.
        for (const cookie of document.cookie.split(';')) {
            const name = cookie.split('=')[0].trim();
            if (!/^_ga(?:_|$)/.test(name)) continue;
            for (const domain of ['', '; domain=' + location.hostname, '; domain=.' + location.hostname]) {
                document.cookie = name + '=; max-age=0; path=/' + domain;
            }
        }
    }

    for (const button of panel.querySelectorAll('[data-analytics-choice]')) {
        button.addEventListener('click', () => {
            const choice = button.dataset.analyticsChoice;
            write(local, CONSENT_KEY, choice);
            panel.hidden = true;
            if (choice === 'granted') start();
            else stop();
            settings.focus({ preventScroll: true });
        });
    }
    settings.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) panel.querySelector('button')?.focus({ preventScroll: true });
    });
    // The choice is never put in front of the visitor: it opens only from Privacy settings
    if (read(local, CONSENT_KEY) === 'granted') start();

    document.addEventListener('portfolio:section', event => {
        if (!enabled || event.detail.section === currentSection) return;
        tick();
        flush();
        currentSection = event.detail.section;
        sectionViewed = false;
        lastActivity = lastTick = performance.now();
        wasEligible = false;
        tick();
    });
    const activity = () => {
        if (performance.now() - lastActivity < 250) return;
        tick();
        lastActivity = performance.now();
        wasEligible = eligible(lastActivity);
    };
    for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) {
        document.addEventListener(type, activity, { passive: true, capture: true });
    }
    document.addEventListener('visibilitychange', () => { tick(); if (document.visibilityState !== 'visible') flush(); });
    window.addEventListener('blur', () => { tick(); flush(); wasEligible = false; });
    window.addEventListener('focus', activity);
    window.addEventListener('pagehide', () => { tick(); flush(); wasEligible = false; });
    window.addEventListener('pageshow', activity);
    window.addEventListener('storage', event => {
        if (event.key === CONSENT_KEY || event.key === OWNER_KEY) {
            if (read(local, OWNER_KEY) === '1' || read(local, CONSENT_KEY) !== 'granted') stop();
            else start();
        }
    });

    document.addEventListener('click', event => {
        if (!enabled) return;
        const link = event.target.closest('a[href]');
        if (link) {
            let url;
            try { url = new URL(link.href, location.href); } catch { return; }
            const kind = url.protocol === 'mailto:' ? 'email'
                : url.hostname === 'github.com' ? 'github'
                : /(^|\.)linkedin\.com$/.test(url.hostname) ? 'linkedin'
                : 'website';
            // Send public item IDs and link kinds; never full destination URLs or emails.
            const item = link.closest('[data-analytics-item]');
            const details = { link_kind: kind, ...(item ? { item_id: item.dataset.analyticsItem.slice(0, 100) } : {}) };
            if (link.matches('.project-link') || link.closest('.project')) emit('project_click', details);
            else if (link.matches('.publication-link') || link.closest('.publication')) emit('publication_click', details);
            else if (link.closest('.profile-contacts')) emit('contact_click', details);
            else if (link.hasAttribute('download') || /\.(pdf|docx?)$/i.test(url.pathname)) emit('cv_download', { link_kind: 'document' });
            else if (link.matches('.lang-link')) emit('language_switch', { target_language: link.hreflang });
            else if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) emit('outbound_click', details);
        }
        const button = event.target.closest('.blog-toggle-btn');
        if (button && button.closest('.blog-post')?.querySelector('.blog-full-content')?.style.display !== 'none') {
            emit('article_expand', { item_id: button.closest('.blog-post').dataset.analyticsItem.slice(0, 100) });
        }
    });
    window.setInterval(tick, 1000);
})();
