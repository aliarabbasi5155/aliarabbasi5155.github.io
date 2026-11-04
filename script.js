// The CV, one page that scrolls, and the blog posts' pages. A dot field fills the
// background: each section of the CV gives it its own shape as it comes on screen, and the
// same field renders the liquid-glass panes at every screen size.
import { DotField, PALETTES } from './dot-field.js';
import { samplePortrait } from './dot-portrait.js';
import { GlassRings } from './glass-rings.js';
import { DeviceTilt } from './device-tilt.js?v=2';

// Each section's shape: [x, y, scale], x and y in half-view units (1 reaches the screen
// edge). `tall` is used on portrait screens.
const SCENES = {
    about: { shape: 'portrait', wide: [0.42, -0.08, 1.6], tall: [0, 0.05, 0.85] },
    experience: { shape: 'beam', wide: [0, 0, 1] },
    projects: { shape: 'terrain', wide: [0, -0.05, 1] },
    skills: { shape: 'streams', wide: [0, 0, 1] },
    education: { shape: 'globe', wide: [0.25, 0, 1], tall: [0, 0.05, 0.8] },
    publications: { shape: 'rings', wide: [0.42, -0.08, 1], tall: [0, 0, 0.7] },
    blog: { shape: 'book', wide: [0.2, 0.02, 1], tall: [0, 0.05, 0.75] },
    contact: { shape: 'ripples', wide: [0.46, -0.05, 1] },
};
const SCENE_ORDER = Object.keys(SCENES);
// The language picker's globe (initPicker), after the sections' scenes
const PICKER_SCENE = SCENE_ORDER.length;

// The page's strings come from _data/<lang>/ui.yml, embedded by the layout
const UI = JSON.parse(document.getElementById('ui-strings')?.textContent || '{}');
const LANG = document.documentElement.lang || 'en';
// What a title cycles through while it scrambles in
const LATIN_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';
const GLYPHS = {
    en: LATIN_GLYPHS,
    it: LATIN_GLYPHS,
    fa: 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی۰۱۲۳۴۵۶۷۸۹',
}[LANG] ?? LATIN_GLYPHS;

// How far each kind of pane tilts toward the pointer, in degrees
const TILT = [
    ['.energy', 5],
    ['.pick', 1.5],
];
const TILT_PERSPECTIVE = 1200;

const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CORAL = getComputedStyle(document.documentElement).getPropertyValue('--coral').trim() || '#f6654a';
// The page's ground in each theme (styles.css --bg), for the browser's own chrome
const THEME_COLORS = { light: '#f1eee7', dark: '#191a1e' };

let field = null;
// While the language picker shows or leaves: how much of its globe may show, 0 to 1
let picker = null;

// The field's palette for a theme. On phones the copy sits right on top of the shapes, so
// keep them quieter. Coral, the site's second colour, warms the grains as the temperature rises.
function fieldPalette(theme) {
    const small = window.matchMedia('(max-width: 768px)').matches;
    return { ...PALETTES[theme === 'light' ? 'paper' : 'sand'], accent: CORAL, ...(small && { gain: 1.05 }) };
}

function initBackground() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;

    const first = document.querySelector('.section')?.id;
    const small = window.matchMedia('(max-width: 768px)').matches;
    const picking = document.documentElement.classList.contains('picking');
    try {
        field = new DotField(canvas, {
            scenes: [...SCENE_ORDER.map(id => SCENES[id]), { shape: 'globe', wide: [0, 0, 1.25], tall: [0, 0, 1.1] }],
            initial: picking ? PICKER_SCENE : Math.max(0, SCENE_ORDER.indexOf(first)),
            palette: fieldPalette(document.documentElement.dataset.theme),
            // Right-to-left pages mirror the shapes along with the layout
            mirror: document.documentElement.dir === 'rtl',
            count: small ? 24000 : 42000,
            pointSize: 2.6,
            maxPixelRatio: small ? 1.25 : 1.5,
            reduceMotion: REDUCE_MOTION,
        });
        field.start();
    } catch (error) {
        console.warn('Dot field disabled:', error);
        return;
    }

    samplePortrait(new URL('profile-photo.jpg', import.meta.url).href, field.count)
        .then(points => field.setPortrait(points))
        .catch(error => console.warn('Portrait sampling failed:', error));

    // Pane bounds are measured each frame, including scrolling and touch tilt.
    // CSS glass remains the fallback if the WebGL renderer cannot initialize.
    field.setGlass(document.querySelectorAll('.glass'));
    document.documentElement.classList.add('gl-glass');

    let gesturePointerId = null;
    const clearPointer = () => {
        gesturePointerId = null;
        field.clearPointer();
    };
    window.addEventListener('pointermove', e => {
        if (!e.isPrimary || (e.pointerType !== 'mouse' && e.pointerId !== gesturePointerId)) return;
        field.setPointer(e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('pointerleave', clearPointer);
    window.addEventListener('blur', clearPointer);
    const releasePointer = e => {
        if (e.pointerId === gesturePointerId) clearPointer();
    };
    document.addEventListener('pointerup', releasePointer, { passive: true });
    document.addEventListener('pointercancel', releasePointer, { passive: true });
    document.addEventListener('lostpointercapture', releasePointer, { passive: true });
    document.addEventListener('scroll', clearPointer, { capture: true, passive: true });
    // Clicks that aren't on a control send a ripple through the dots
    document.addEventListener('pointerdown', e => {
        if (!e.isPrimary) return;
        if (e.pointerType !== 'mouse') gesturePointerId = e.pointerId;
        field.setPointer(e.clientX, e.clientY);
        if (e.target.closest('a, button, input, label, textarea, select')) return;
        field.ripple(e.clientX, e.clientY);
    }, { passive: true });
}

// Dark or light: the system's theme (set before the first paint, in the layout's head)
// until the visitor picks one with either switch. A pick that matches the system is
// forgotten, so the page goes back to following the system.
function initTheme() {
    const root = document.documentElement;
    const toggles = document.querySelectorAll('.theme-toggle');
    const system = window.matchMedia('(prefers-color-scheme: light)');
    const meta = document.querySelector('meta[name="theme-color"]');
    const stored = () => {
        try {
            return localStorage.getItem('theme');
        } catch {
            return null;
        }
    };
    const show = theme => {
        for (const toggle of toggles) toggle.setAttribute('aria-pressed', theme === 'dark');
    };
    const apply = theme => {
        root.dataset.theme = theme;
        if (meta) meta.content = THEME_COLORS[theme];
        show(theme);
        field?.setPalette(fieldPalette(theme));
    };
    // The whole page crossfades, the field with it, where the browser can
    const switchTo = theme => {
        if (REDUCE_MOTION || !document.startViewTransition) apply(theme);
        else document.startViewTransition(() => apply(theme));
    };

    show(root.dataset.theme);
    for (const toggle of toggles) {
        toggle.addEventListener('click', () => {
            const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
            try {
                if (theme === (system.matches ? 'light' : 'dark')) localStorage.removeItem('theme');
                else localStorage.setItem('theme', theme);
            } catch {}
            switchTo(theme);
        });
    }
    system.addEventListener('change', () => {
        if (!['light', 'dark'].includes(stored())) switchTo(system.matches ? 'light' : 'dark');
    });
}

// The footer's slider is the field's sampling temperature, like an LLM's:
// at 0 every grain sits on its shape, toward 2 they wander off it
function initTemperature() {
    const input = document.querySelector('.energy input');
    if (!input) return;
    const value = document.querySelector('.energy-value');
    const band = document.querySelector('.energy-band');
    const bands = UI.temperature?.bands ?? [];
    const format = new Intl.NumberFormat(LANG, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    const apply = () => {
        const temperature = input.value / 100;
        value.textContent = format.format(temperature);
        band.textContent = (bands.find(b => temperature <= b.max) ?? bands.at(-1))?.label ?? '';
        field?.setTemperature(temperature);
        // The field stays as it is up to the default 0.7, then warms toward chaotic
        field?.setAccent(Math.max(0, temperature - 0.7) * 0.6);
    };
    input.addEventListener('input', apply);
    apply();
}

// A gentle 3D tilt: the edge under the pointer lifts toward the viewer.
// Each pane publishes its tilt as element.dotTilt so the glass tilts with it.
function initTilt() {
    if (REDUCE_MOTION) return;
    const panes = [];
    const reset = pane => {
        pane.targetX = 0;
        pane.targetY = 0;
        pane.pointerId = null;
    };
    for (const [selector, degrees] of TILT) {
        for (const element of document.querySelectorAll(selector)) {
            const pane = { element, max: (degrees * Math.PI) / 180, x: 0, y: 0, targetX: 0, targetY: 0, pointerId: null };
            const move = e => {
                if (!e.isPrimary) return;
                const rect = element.getBoundingClientRect();
                const u = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
                const v = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
                pane.targetX = v * pane.max;
                pane.targetY = -u * pane.max;
            };
            // Touch has no hover: press and drag to tilt, leaving native scrolling intact.
            element.addEventListener('pointerdown', e => {
                if (!e.isPrimary || e.pointerType === 'mouse' || e.target.closest('input, textarea, select')) return;
                pane.pointerId = e.pointerId;
                move(e);
            }, { passive: true });
            element.addEventListener('pointermove', e => {
                if (e.pointerType !== 'mouse' && e.pointerId !== pane.pointerId) return;
                move(e);
            }, { passive: true });
            element.addEventListener('pointerleave', e => {
                if (e.isPrimary) reset(pane);
            }, { passive: true });
            panes.push(pane);
        }
    }

    const release = e => {
        for (const pane of panes) {
            if (pane.pointerId === e.pointerId) reset(pane);
        }
    };
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });
    document.addEventListener('lostpointercapture', release, { passive: true });
    document.addEventListener('scroll', () => panes.forEach(reset), { capture: true, passive: true });
    window.addEventListener('blur', () => panes.forEach(reset));

    const step = delta => {
        const follow = 1 - Math.exp(-delta * 9);
        for (const pane of panes) {
            pane.x += (pane.targetX - pane.x) * follow;
            pane.y += (pane.targetY - pane.y) * follow;
            const settled = !pane.targetX && !pane.targetY && Math.abs(pane.x) < 1e-4 && Math.abs(pane.y) < 1e-4;
            if (settled) {
                // Back to flat: drop the transform so text renders crisp again
                if (pane.element.dotTilt) {
                    pane.x = pane.y = 0;
                    pane.element.style.transform = '';
                    pane.element.dotTilt = null;
                }
                continue;
            }
            pane.element.style.transform = `perspective(${TILT_PERSPECTIVE}px) rotateX(${pane.x}rad) rotateY(${pane.y}rad)`;
            pane.element.dotTilt = { x: pane.x, y: pane.y, perspective: TILT_PERSPECTIVE };
        }
    };

    if (!panes.length) return;
    // In step with the field, so the glass and the content tilt on the same frame
    if (field) {
        field.onFrame(step);
        return;
    }
    let last = 0;
    const loop = now => {
        step(last ? Math.min(0.05, (now - last) / 1000) : 1 / 60);
        last = now;
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
}

// Links to other sites open in a new tab
function initExternalLinks() {
    for (const link of document.querySelectorAll('a[href^="http"]')) {
        if (link.host === location.host) continue;
        link.target = '_blank';
        link.rel = 'noopener';
    }
}

// Letters cycle through random glyphs, then settle left to right
function scramble(element, text, duration = 600, glyphs = GLYPHS) {
    cancelAnimationFrame(element.scrambleFrame);
    if (REDUCE_MOTION) {
        element.textContent = text;
        return;
    }
    const start = performance.now();
    const step = now => {
        const progress = Math.min(1, (now - start) / duration);
        const settled = Math.floor(progress * text.length);
        let out = '';
        for (let i = 0; i < text.length; i++) {
            // Spaces and zero-width non-joiners keep the word shapes in place
            const keep = i < settled || text[i] === ' ' || text[i] === '\u200c';
            out += keep ? text[i] : glyphs[(Math.random() * glyphs.length) | 0];
        }
        element.textContent = out;
        if (progress < 1) element.scrambleFrame = requestAnimationFrame(step);
    };
    element.scrambleFrame = requestAnimationFrame(step);
}

// Every language link remembers its language, so the next visit to the English page goes
// straight there (the layout's head reads it); not while previewing the picker (?picker)
function initLanguageMemory() {
    document.addEventListener('click', event => {
        const link = event.target.closest('.lang-link');
        if (!link || document.documentElement.classList.contains('picker-preview')) return;
        try {
            localStorage.setItem('language', link.hreflang);
        } catch {}
    });
}

// The language picker (styles.css), on a first visit to the English page: a glass pane for
// each language over the field's globe. Each greeting scrambles in, and again as its pane
// is hovered. Choosing a pane widens it over the others; English then lets the panes fall
// away onto the hero as the globe dissolves, and the others go to their page. Escape
// stays on English without remembering a choice, and the arrow keys move between panes.
// The page underneath waits with its bar put away and its hero's entrance held.
function initPicker() {
    const root = document.documentElement;
    const dialog = document.querySelector('.language-picker');
    if (!dialog || !root.classList.contains('picking')) return;
    const picks = [...dialog.querySelectorAll('.pick')];
    const behind = document.querySelectorAll('.topbar, .sections, .site-footer');
    for (const element of behind) element.inert = true;
    picker = { level: 1, leaving: false };
    dialog.focus({ preventScroll: true });
    const wait = ms => (REDUCE_MOTION ? 0 : ms);

    // Persian scrambles through its own words' letters, the only ones this page loads
    picks.forEach((pick, i) => {
        const word = pick.querySelector('.pick-word');
        const text = word.textContent;
        const glyphs = pick.hreflang === 'fa' ? [...new Set(pick.textContent.replace(/[^\u0600-\u06ff]/g, ''))].join('') : LATIN_GLYPHS;
        scramble(word, text, 1100 + i * 150, glyphs);
        pick.addEventListener('pointerenter', () => scramble(word, text, 600, glyphs));
    });

    field?.onFrame(delta => {
        if (!picker) return;
        if (picker.leaving) picker.level = Math.max(0, picker.level - delta / 0.7);
        field.intro = Math.min(field.intro, picker.level);
    });

    const reveal = () => {
        picker.leaving = true;
        dialog.classList.add('leaving');
        // Back to the first section's scene, unseen under the hero
        field?.morphTo(Math.max(0, SCENE_ORDER.indexOf(document.querySelector('.section')?.id)));
        setTimeout(() => {
            picker = null;
            dialog.remove();
            root.classList.remove('picking');
            for (const element of behind) element.inert = false;
            const name = document.querySelector('.hero-name');
            if (name) scramble(name, name.textContent.trim(), 900);
        }, wait(900));
    };
    const choose = pick => {
        if (dialog.classList.contains('chosen') || picker.leaving) return;
        pick.classList.add('active');
        dialog.classList.add('chosen');
        setTimeout(() => (pick.hreflang === LANG ? reveal() : location.assign(pick.href)), wait(750));
    };

    for (const pick of picks) {
        pick.addEventListener('click', event => {
            event.preventDefault();
            choose(pick);
        });
    }
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (!dialog.classList.contains('chosen')) reveal();
        } else if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
            const from = picks.indexOf(document.activeElement);
            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
            const next = from < 0 ? (step > 0 ? 0 : picks.length - 1) : (from + step + picks.length) % picks.length;
            picks[next].focus();
            event.preventDefault();
        }
    });
}

// The hero, the page's first screen (styles.css): the rings float while it is in view and
// the name scrambles in like a section title. The field's dots gather only as the page
// scrolls on, and leave again on the way back; while the hero fills the screen the field
// has nothing to show, so after drawing that frame it rests until the page moves.
function initHero() {
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const rings = new GlassRings(hero.querySelector('.opening-rings'), { reduceMotion: REDUCE_MOTION });
    const tilt = new DeviceTilt((x, y) => rings.setTilt(x, y), hero.querySelector('.opening-rings'));
    // Only while some of the hero shows. Below it, its bottom edge still touches the top of
    // the screen, which an observer counts as intersecting, so it asks for a sliver.
    new IntersectionObserver(([entry]) => {
        if (entry.intersectionRatio > 0.01) {
            rings.start();
            tilt.start();
        } else {
            rings.stop();
            tilt.stop();
        }
    }, { threshold: [0, 0.02] }).observe(hero);
    const name = hero.querySelector('.hero-name');
    scramble(name, name.textContent.trim(), 900);

    const covering = () => {
        const { top, bottom } = hero.getBoundingClientRect();
        return top > -1 && bottom >= innerHeight - 1;
    };
    field?.onFrame(() => {
        // The language picker has the field to itself until it has gone
        if (picker) return;
        // The dots come in over the last three quarters of the hero's way out
        const { bottom, height } = hero.getBoundingClientRect();
        const away = 1 - Math.min(1, Math.max(0, bottom / height));
        field.intro = Math.min(field.intro, Math.max(0, (away - 0.25) / 0.75));
        if (covering()) field.stop();
    });
    const wake = () => {
        if (!covering()) field?.start();
    };
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake);
}

// The section on screen: the one across a line a third of the way down (the last once the
// page can scroll no further). Its link in the bar lights up, the field takes its shape and
// analytics hears of it (analytics.js); each title scrambles in the first time it shows.
function initSections() {
    const sections = [...document.querySelectorAll('.section')];
    if (!sections.length) return;
    const links = new Map([...document.querySelectorAll('.topnav a[data-section]')].map(link => [link.dataset.section, link]));
    let current = null;
    const show = section => {
        if (section === current) return;
        if (current) {
            current.classList.remove('current');
            links.get(current.id)?.removeAttribute('aria-current');
        }
        current = section;
        if (!section) return;
        section.classList.add('current');
        links.get(section.id)?.setAttribute('aria-current', 'true');
        if (!picker) field?.morphTo(Math.max(0, SCENE_ORDER.indexOf(section.id)));
        document.dispatchEvent(new CustomEvent('portfolio:section', { detail: { section: section.id } }));
    };
    const find = () => {
        if (scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2) return sections.at(-1);
        const line = innerHeight * 0.35;
        return sections.find(section => {
            const { top, bottom } = section.getBoundingClientRect();
            return top <= line && bottom > line;
        }) ?? null;
    };
    let queued = false;
    const update = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            show(find());
        });
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    const titles = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            titles.unobserve(entry.target);
            scramble(entry.target, entry.target.textContent.trim(), 700);
        }
    }, { threshold: 0.6 });
    for (const section of sections) titles.observe(section.querySelector('.section-title span'));
}

// On narrow screens the bar's links fold into a menu: the button opens it, and a link, a
// click anywhere else or Escape closes it
function initMenu() {
    const bar = document.querySelector('.topbar');
    const button = bar?.querySelector('.menu-toggle');
    if (!button) return;
    const set = open => {
        bar.classList.toggle('open', open);
        button.setAttribute('aria-expanded', open);
    };
    button.addEventListener('click', () => set(!bar.classList.contains('open')));
    bar.querySelector('.topnav').addEventListener('click', event => {
        if (event.target.closest('a')) set(false);
    });
    document.addEventListener('click', event => {
        if (!bar.contains(event.target)) set(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !bar.classList.contains('open')) return;
        set(false);
        button.focus();
    });
}

// Long lists show their first few (data-fold) and the rest on request
function initFolds() {
    for (const list of document.querySelectorAll('[data-fold]')) {
        const rest = [...list.children].slice(Number(list.dataset.fold));
        if (!rest.length) continue;
        for (const item of rest) item.classList.add('folded');
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'fold-toggle';
        toggle.textContent = UI.show_more;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', () => {
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            for (const item of rest) item.classList.toggle('folded', !open);
            toggle.setAttribute('aria-expanded', open);
            toggle.textContent = open ? UI.show_less : UI.show_more;
        });
        // A list item can't hold a button, so the updates' goes after them; the posts' joins
        // their grid, along its whole width
        if (list.tagName === 'UL') list.after(toggle);
        else list.append(toggle);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
} else {
    initAll();
}

function initAll() {
    initBackground();
    initTheme();
    initHero();
    initPicker();
    initSections();
    initLanguageMemory();
    initTemperature();
    initTilt();
    initExternalLinks();
    initMenu();
    initFolds();
}
