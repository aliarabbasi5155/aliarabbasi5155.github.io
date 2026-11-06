// A blog post's own page (_layouts/post.html): the theme switch, links out opening in a new
// tab, the share buttons, and "Ask Alino" beside text the reader selects (it opens the site
// with the question asked, ?ask=).

import { canShare, copyLink, flash, share } from './share.js';
import { initSelectionAsk } from './selection-ask.js';

const root = document.documentElement;
const UI = JSON.parse(document.getElementById('ui-strings').textContent);
const HOME = JSON.parse(document.getElementById('post-home').textContent);
const THEME_COLORS = { light: '#f1eee7', dark: '#191a1e' };

// Dark or light: as the site (script.js), the system's until the visitor picks one
(() => {
    const system = matchMedia('(prefers-color-scheme: light)');
    const meta = document.querySelector('meta[name="theme-color"]');
    const toggles = document.querySelectorAll('.theme-toggle');
    const stored = () => { try { return localStorage.getItem('theme'); } catch { return null; } };
    const show = theme => toggles.forEach(toggle => toggle.setAttribute('aria-pressed', theme === 'dark'));
    const apply = theme => {
        root.dataset.theme = theme;
        meta.content = THEME_COLORS[theme];
        show(theme);
    };
    show(root.dataset.theme);
    for (const toggle of toggles) {
        toggle.addEventListener('click', () => {
            const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
            try {
                if (theme === (system.matches ? 'light' : 'dark')) localStorage.removeItem('theme');
                else localStorage.setItem('theme', theme);
            } catch {}
            if (matchMedia('(prefers-reduced-motion: reduce)').matches || !document.startViewTransition) apply(theme);
            else document.startViewTransition(() => apply(theme));
        });
    }
    system.addEventListener('change', () => {
        if (!stored()) apply(system.matches ? 'light' : 'dark');
    });
})();

// Links to other sites open beside this one
for (const link of document.querySelectorAll('a[href^="http"]')) {
    if (link.host === location.host) continue;
    link.target = '_blank';
    link.rel = 'noopener';
}

// Sharing: the share sheet where there is one, the link copied, or one of the places
for (const box of document.querySelectorAll('.share')) {
    const post = { url: new URL(box.dataset.url, location.href).href, title: box.dataset.title };
    const native = box.querySelector('.share-native');
    if (canShare()) {
        native.hidden = false;
        native.addEventListener('click', () => share(post, native));
    }
    const copy = box.querySelector('.share-copy');
    copy.addEventListener('click', async () => {
        if (await copyLink(post.url)) flash(copy, copy.dataset.copied);
    });
    for (const link of box.querySelectorAll('.share-to')) {
        link.target = '_blank';
        link.rel = 'noopener';
    }
}

// Selected text: a chip beside it to ask Alino about it, on the site
initSelectionAsk({
    scope: document.querySelector('.post-article'),
    label: UI.blog?.ask ?? 'Ask Alino',
    ask: text => location.assign(`${HOME}?ask=${encodeURIComponent(text)}`),
});
