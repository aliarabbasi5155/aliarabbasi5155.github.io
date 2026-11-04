// Lab only: what the four concept prototypes (lab/bento.html, canvas.html, pinned.html,
// chapters.html) share with the site: the dot field and its glass, the theme, the
// scrambling titles, the blog's "show more" and links that open in a new tab.
import { DotField, PALETTES } from '../dot-field.js';
import { samplePortrait } from '../dot-portrait.js';

export const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const UI = JSON.parse(document.getElementById('ui-strings')?.textContent || '{}');

// Each section's shape, as on the site: [x, y, scale] in half-view units
export const SCENES = {
    blog: { shape: 'book', wide: [0.2, 0.02, 1], tall: [0, 0.05, 0.75] },
    about: { shape: 'portrait', wide: [0.42, -0.08, 1.6], tall: [0, 0.05, 0.85] },
    experience: { shape: 'beam', wide: [0, 0, 1] },
    education: { shape: 'globe', wide: [0.25, 0, 1], tall: [0, 0.05, 0.8] },
    skills: { shape: 'streams', wide: [0, 0, 1] },
    projects: { shape: 'terrain', wide: [0, -0.05, 1] },
    publications: { shape: 'rings', wide: [0.42, -0.08, 1], tall: [0, 0, 0.7] },
    interests: { shape: 'ripples', wide: [0.46, -0.05, 1] },
};

const CORAL = getComputedStyle(document.documentElement).getPropertyValue('--coral').trim() || '#f6654a';
const THEME_COLORS = { light: '#f1eee7', dark: '#191a1e' };

export function fieldPalette(theme) {
    const small = window.matchMedia('(max-width: 768px)').matches;
    return { ...PALETTES[theme === 'light' ? 'paper' : 'sand'], accent: CORAL, ...(small && { gain: 1.05 }) };
}

// The field over the page's canvas, with its scenes in the given order (ids from SCENES,
// or full scene objects), drawing every .glass element as glass. Null without WebGL.
export function createField(order, { initial = 0, intro = true } = {}) {
    const canvas = document.getElementById('canvas');
    if (!canvas) return null;
    const small = window.matchMedia('(max-width: 768px)').matches;
    let field;
    try {
        field = new DotField(canvas, {
            scenes: order.map(item => (typeof item === 'string' ? SCENES[item] : item)),
            initial,
            palette: fieldPalette(document.documentElement.dataset.theme),
            count: small ? 24000 : 42000,
            pointSize: 2.6,
            maxPixelRatio: small ? 1.25 : 1.5,
            reduceMotion: REDUCE_MOTION,
        });
    } catch (error) {
        console.warn('Dot field disabled:', error);
        return null;
    }
    if (!intro) field.intro = 1;
    field.start();
    samplePortrait(new URL('../profile-photo.jpg', import.meta.url).href, field.count)
        .then(points => field.setPortrait(points))
        .catch(() => {});
    field.setGlass(document.querySelectorAll('.glass'));
    document.documentElement.classList.add('gl-glass');
    window.addEventListener('pointermove', e => e.pointerType === 'mouse' && field.setPointer(e.clientX, e.clientY), { passive: true });
    document.addEventListener('pointerleave', () => field.clearPointer());
    document.addEventListener('pointerdown', e => {
        if (!e.isPrimary || e.target.closest('a, button, input, label, summary')) return;
        field.ripple(e.clientX, e.clientY);
    }, { passive: true });
    return field;
}

// Dark or light, following the system until the visitor picks one, as on the site
export function initTheme(getField) {
    const root = document.documentElement;
    const toggles = document.querySelectorAll('.theme-toggle');
    const show = theme => toggles.forEach(toggle => toggle.setAttribute('aria-pressed', theme === 'dark'));
    const apply = theme => {
        root.dataset.theme = theme;
        document.querySelector('meta[name="theme-color"]').content = THEME_COLORS[theme];
        show(theme);
        getField()?.setPalette(fieldPalette(theme));
    };
    show(root.dataset.theme);
    for (const toggle of toggles) {
        toggle.addEventListener('click', () => {
            const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
            try { localStorage.setItem('theme', theme); } catch {}
            if (REDUCE_MOTION || !document.startViewTransition) apply(theme);
            else document.startViewTransition(() => apply(theme));
        });
    }
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';

// Letters cycle through random glyphs, then settle left to right
export function scramble(element, text = element.textContent.trim(), duration = 600) {
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
        for (let i = 0; i < text.length; i++) out += i < settled || text[i] === ' ' ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        element.textContent = out;
        if (progress < 1) element.scrambleFrame = requestAnimationFrame(step);
    };
    element.scrambleFrame = requestAnimationFrame(step);
}

// A blog post's "show more" opens the rest of it in place
export function initBlogToggles() {
    for (const button of document.querySelectorAll('.blog-toggle-btn')) {
        button.addEventListener('click', () => {
            const full = button.closest('.blog-post').querySelector('.blog-full-content');
            full.hidden = !full.hidden;
            button.textContent = full.hidden ? UI.show_more : UI.show_less;
        });
    }
}

export function initExternalLinks() {
    for (const link of document.querySelectorAll('a[href^="http"]')) {
        if (link.host === location.host) continue;
        link.target = '_blank';
        link.rel = 'noopener';
    }
}
