// The CV as a canvas (_layouts/cv.html). The camera is the world's transform, moved here
// frame by frame: focusing a pane flies it to the middle of the free screen at a size that
// fits, pulling back on the way when the trip is long, so you see where you go; the overview
// fits the whole map. Wires run from Ali's pane to every section, edge to edge, like a node
// graph, and the one to the pane in view lights up. The rail lists the panes by name over a
// small map that shows what is on screen. The dot field behind takes the shape of the pane in
// view (a globe for the map) and draws every pane as liquid glass.
//
// The orb, the coral glass rings, goes with you everywhere: it rides the corner of the pane in
// view (each pane's .orb-slot) on a spring, so it trails a flight, stretching with its speed,
// and rings as it lands; on the map it marks where you are, and off screen it waits at the
// edge. Its middle shows the section in view, flipping over to the next. Pressed, it opens
// Alino, Ali's assistant (ask.js). Picked up, it follows the pointer on a looser spring; let
// go over a pane or a name in the rail, it takes you there; anywhere else, it springs back.
//
// Also here: the language picker on a first visit to the English page, the languages
// remembered, the theme, and the section in view told to analytics.js (portfolio:section).
// Right to left (Persian), the map is mirrored and the rail sits on the right.
//
// On phones the canvas is a map too: the panes, each the size of the screen, sit on the same
// three-by-three map, wired to Ali's, and the camera flies between them, pulling back on the
// way. A swipe goes to the pane on that side, a pinch (or the map button) shows the whole map,
// and a tap there flies into a pane.
import { DotField, PALETTES } from './dot-field.js';
import { samplePortrait } from './dot-portrait.js';
import { GlassRings } from './glass-rings.js';
import { initAsk } from './ask.js';
import { livePhoto } from './live-photo.js';

const UI = JSON.parse(document.getElementById('ui-strings')?.textContent || '{}');
const ALINO = UI.alino ?? {};
const LANG = document.documentElement.lang || 'en';
const RTL = document.documentElement.dir === 'rtl';
const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

// Each section's shape in the dot field: [x, y, scale] in half-view units
const SCENES = {
    blog: { shape: 'book', wide: [0.2, 0.02, 1], tall: [0, 0.05, 0.75] },
    about: { shape: 'portrait', wide: [0.42, -0.08, 1.6], tall: [0, 0.05, 0.85] },
    experience: { shape: 'beam', wide: [0, 0, 1] },
    education: { shape: 'globe', wide: [0.25, 0, 1], tall: [0, 0.05, 0.8] },
    skills: { shape: 'streams', wide: [0, 0, 1] },
    projects: { shape: 'terrain', wide: [0, -0.05, 1] },
    publications: { shape: 'rings', wide: [0.42, -0.08, 1], tall: [0, 0, 0.7] },
    interests: { shape: 'ripples', wide: [0.46, -0.05, 1] },
};
const IDS = Object.keys(SCENES);
// Then Ali's pane, and the globe for the map (and the language picker)
const ORDER = [...IDS.map(id => SCENES[id]), { shape: 'ripples', wide: [0.3, 0, 1], tall: [0, 0.1, 0.9] }, { shape: 'globe', wide: [0, 0, 1.15], tall: [0, 0, 1] }];
const HOME = IDS.length;
const MAP = HOME + 1;
const SVG = 'http://www.w3.org/2000/svg';
const CORAL = getComputedStyle(root).getPropertyValue('--coral').trim() || '#f6654a';
// The page's ground in each theme (styles.css --bg), for the browser's own chrome
const THEME_COLORS = { light: '#f1eee7', dark: '#191a1e' };
// What a title cycles through while it scrambles in: Persian through its own letters
const LATIN_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';
const GLYPHS = LANG === 'fa' ? 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی۰۱۲۳۴۵۶۷۸۹' : LATIN_GLYPHS;

const viewport = document.querySelector('.viewport');
const world = document.querySelector('.world');
const wires = document.querySelector('.wires');
const rail = document.querySelector('.rail');
const minimap = document.querySelector('.minimap');
const stepper = document.querySelector('.stepper');
const panes = new Map([...document.querySelectorAll('.pane')].map(pane => [pane.id, pane]));
// Ali, then the sections in the CV's order (the page's order), for next and previous
const SEQUENCE = [...panes.keys()];
const railButtons = [...document.querySelectorAll('.rail [data-go]')];
const phone = window.matchMedia('(max-width: 760px)');
const geometry = new Map();
const cam = { tx: 0, ty: 0, s: 1 };
// The panes' corners, in world pixels (canvas.css), and the glass's rim: the field draws the
// glass on screen, so both are scaled here with the view, and a pane keeps its shape
let radius = 44;
const RIM = { bevel: 28, refraction: 34 };
let flight = null;
let mode = 'focus';
let current = 'home';
let intro = 0;

// On phones, the room between panes on the map, where the wires run
const PHONE_GAP = 64;

const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const digits = text => (UI.digits?.length === 10 ? String(text).replace(/\d/g, d => UI.digits[d]) : String(text));

// ---------- The field ----------

// On phones the copy sits right on top of the shapes, so they are a touch quieter
function fieldPalette(theme) {
    return { ...PALETTES[theme === 'light' ? 'paper' : 'sand'], accent: CORAL, ...(phone.matches && { gain: 1.05 }) };
}

function createField(initial) {
    const canvas = document.getElementById('canvas');
    if (!canvas) return null;
    const small = window.matchMedia('(max-width: 768px)').matches;
    let created;
    try {
        created = new DotField(canvas, {
            scenes: ORDER,
            initial,
            palette: fieldPalette(root.dataset.theme),
            // Right-to-left pages mirror the shapes along with the layout
            mirror: RTL,
            count: small ? 24000 : 42000,
            pointSize: 2.6,
            maxPixelRatio: small ? 1.25 : 1.5,
            reduceMotion: REDUCE_MOTION,
        });
    } catch (error) {
        console.warn('Dot field disabled:', error);
        return null;
    }
    created.start();
    samplePortrait(new URL('/profile-photo.jpg', location.href).href, created.count)
        .then(points => created.setPortrait(points))
        .catch(() => {});
    created.setGlass(document.querySelectorAll(root.classList.contains('picking') ? '.pick' : '.pane'));
    root.classList.add('gl-glass');
    addEventListener('pointermove', e => e.pointerType === 'mouse' && created.setPointer(e.clientX, e.clientY), { passive: true });
    document.addEventListener('pointerleave', () => created.clearPointer());
    // A press that isn't on a control sends a ripple through the dots
    document.addEventListener('pointerdown', e => {
        if (!e.isPrimary || e.target.closest('a, button, input, label, summary')) return;
        created.ripple(e.clientX, e.clientY);
    }, { passive: true });
    return created;
}

// ---------- Theme, languages, links, titles ----------

// Dark or light: the system's theme (set before the first paint, in the layout's head) until
// the visitor picks one. A pick that matches the system is forgotten, so the page goes back
// to following the system.
function initTheme() {
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
    const show = theme => toggles.forEach(toggle => toggle.setAttribute('aria-pressed', theme === 'dark'));
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

// Every language link remembers its language, so the next visit to the English page goes
// straight there (the layout's head reads it); not while previewing the picker (?picker)
function initLanguageMemory() {
    document.addEventListener('click', event => {
        const link = event.target.closest('.lang-link');
        if (!link || root.classList.contains('picker-preview')) return;
        try {
            localStorage.setItem('language', link.hreflang);
        } catch {}
    });
}

// Links to other sites open in a new tab
function initExternalLinks() {
    for (const link of document.querySelectorAll('a[href^="http"]')) {
        if (link.host === location.host) continue;
        link.target = '_blank';
        link.rel = 'noopener';
    }
}

// A blog post's "show more" opens the rest of it in place (analytics.js reads its display)
function initBlogToggles() {
    for (const button of document.querySelectorAll('.blog-toggle-btn')) {
        button.addEventListener('click', () => {
            const full = button.closest('.blog-post').querySelector('.blog-full-content');
            const opening = full.style.display === 'none';
            full.style.display = opening ? '' : 'none';
            button.textContent = opening ? UI.show_less : UI.show_more;
            button.setAttribute('aria-expanded', opening);
        });
    }
}

// Letters cycle through random glyphs, then settle in reading order
function scramble(element, text = element.textContent.trim(), duration = 600, glyphs = GLYPHS) {
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
            const keep = i < settled || text[i] === ' ' || text[i] === '‌';
            out += keep ? text[i] : glyphs[(Math.random() * glyphs.length) | 0];
        }
        element.textContent = out;
        if (progress < 1) element.scrambleFrame = requestAnimationFrame(step);
    };
    element.scrambleFrame = requestAnimationFrame(step);
}

// ---------- The layout ----------

// The part of the screen the panes have: beside the rail, clear of the top and bottom bars
function stage() {
    const vw = innerWidth;
    const vh = innerHeight;
    if (phone.matches) return { left: 8, top: 64, width: vw - 16, height: vh - 64 - 84 };
    const box = rail.getBoundingClientRect();
    const top = 72;
    const bottom = 84;
    if (RTL) return { left: 28, top, width: box.left - 24 - 28, height: vh - top - bottom };
    const left = box.right + 24;
    return { left, top, width: vw - left - 28, height: vh - top - bottom };
}

function layout() {
    const vw = innerWidth;
    const vh = innerHeight;
    const flip = RTL ? -1 : 1;
    radius = parseFloat(getComputedStyle(panes.get('home')).borderTopLeftRadius) || radius;
    for (const [id, pane] of panes) {
        // On phones the same map, three by three, each pane the size of the screen
        const w = vw - 32;
        const h = vh - 140;
        const g = phone.matches
            ? { x: flip * Math.sign(pane.dataset.x) * (w + PHONE_GAP), y: Math.sign(pane.dataset.y) * (h + PHONE_GAP), w, h }
            : { x: flip * pane.dataset.x, y: +pane.dataset.y, w: +pane.dataset.w, h: +pane.dataset.h };
        geometry.set(id, g);
        Object.assign(pane.style, { left: `${g.x - g.w / 2}px`, top: `${g.y - g.h / 2}px`, width: `${g.w}px`, height: `${g.h}px` });
    }
    drawWires();
    drawMinimap();
    const box = stage();
    root.style.setProperty('--stage-center', `${box.left + box.width / 2}px`);
}

// ---------- Wires ----------

// From pane a to pane b, edge to edge. Side by side or one above the other, the wire leaves
// and enters straight; across a corner it leaves a's side near that corner and turns into
// b's nearer end, a quarter turn.
function route(a, b) {
    const sx = Math.sign(b.x - a.x) || 1;
    const sy = Math.sign(b.y - a.y) || 1;
    const gapX = Math.abs(b.x - a.x) - (a.w + b.w) / 2;
    const gapY = Math.abs(b.y - a.y) - (a.h + b.h) / 2;
    let p1, p2, c1, c2;
    if (gapX > 0 && gapY > 0) {
        p1 = { x: a.x + sx * a.w / 2, y: a.y + sy * (a.h / 2 - 80) };
        p2 = { x: b.x - sx * (b.w / 2 - 110), y: b.y - sy * b.h / 2 };
        c1 = { x: p1.x + sx * Math.abs(p2.x - p1.x) * 0.6, y: p1.y };
        c2 = { x: p2.x, y: p2.y - sy * Math.abs(p2.y - p1.y) * 0.6 };
    } else if (gapX > 0) {
        const y = (Math.max(a.y - a.h / 2, b.y - b.h / 2) + Math.min(a.y + a.h / 2, b.y + b.h / 2)) / 2;
        p1 = { x: a.x + sx * a.w / 2, y };
        p2 = { x: b.x - sx * b.w / 2, y };
        c1 = { x: lerp(p1.x, p2.x, 0.5), y: p1.y };
        c2 = { x: lerp(p1.x, p2.x, 0.5), y: p2.y };
    } else {
        const x = (Math.max(a.x - a.w / 2, b.x - b.w / 2) + Math.min(a.x + a.w / 2, b.x + b.w / 2)) / 2;
        p1 = { x, y: a.y + sy * a.h / 2 };
        p2 = { x, y: b.y - sy * b.h / 2 };
        c1 = { x: p1.x, y: lerp(p1.y, p2.y, 0.5) };
        c2 = { x: p2.x, y: lerp(p1.y, p2.y, 0.5) };
    }
    const d = `M${p1.x} ${p1.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
    return { d, p1, p2 };
}

function svg(name, attributes) {
    const element = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
}

function drawWires() {
    const home = geometry.get('home');
    const groups = [];
    {
        SEQUENCE.slice(1).forEach((id, i) => {
            const { d, p1, p2 } = route(home, geometry.get(id));
            const group = svg('g', { class: 'wire', 'data-to': id, style: `--i: ${i}` });
            group.append(
                svg('path', { class: 'wire-line', d }),
                // A short bright dash that runs along it, Ali to the section
                svg('path', { class: 'wire-flow', d, pathLength: 100 }),
                svg('circle', { class: 'wire-port', cx: p1.x, cy: p1.y, r: 5 }),
                svg('circle', { class: 'wire-port wire-port-end', cx: p2.x, cy: p2.y, r: 5 }),
            );
            groups.push(group);
        });
    }
    wires.replaceChildren(...groups);
}

// ---------- The small map ----------

let viewFrame = null;

function bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of geometry.values()) {
        minX = Math.min(minX, g.x - g.w / 2); maxX = Math.max(maxX, g.x + g.w / 2);
        minY = Math.min(minY, g.y - g.h / 2); maxY = Math.max(maxY, g.y + g.h / 2);
    }
    return { minX, minY, maxX, maxY };
}

function drawMinimap() {
    if (phone.matches) return minimap.replaceChildren();
    const { minX, minY, maxX, maxY } = bounds();
    const margin = 90;
    minimap.setAttribute('viewBox', `${minX - margin} ${minY - margin} ${maxX - minX + 2 * margin} ${maxY - minY + 2 * margin}`);
    const home = geometry.get('home');
    const items = [];
    for (const [id, g] of geometry) {
        if (id !== 'home') items.push(svg('path', { class: 'mm-wire', d: route(home, g).d }));
    }
    for (const [id, g] of geometry) {
        items.push(svg('rect', { class: 'mm-pane', 'data-pane': id, x: g.x - g.w / 2, y: g.y - g.h / 2, width: g.w, height: g.h, rx: 110 }));
    }
    viewFrame = svg('rect', { class: 'mm-view', rx: 80 });
    items.push(viewFrame);
    minimap.replaceChildren(...items);
    markMinimap();
}

function markMinimap() {
    for (const rect of minimap.querySelectorAll('.mm-pane')) rect.classList.toggle('current', mode === 'focus' && rect.dataset.pane === current);
}

// ---------- The camera ----------

function apply() {
    world.style.transform = `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`;
    wires.style.setProperty('--inv', (1 / cam.s).toFixed(4));
    if (viewFrame) {
        viewFrame.setAttribute('x', -cam.tx / cam.s);
        viewFrame.setAttribute('y', -cam.ty / cam.s);
        viewFrame.setAttribute('width', innerWidth / cam.s);
        viewFrame.setAttribute('height', innerHeight / cam.s);
    }
}

// Each frame, before the field measures its glass, so the glass never trails the panes
let lastTick = 0;
const landings = [];
function tick(now) {
    const dt = lastTick ? Math.min(1 / 30, (now - lastTick) / 1000) : 1 / 60;
    lastTick = now;
    if (flight) {
        const t = Math.min(1, (now - flight.start) / flight.duration);
        const e = ease(t);
        const s = Math.exp(lerp(flight.l0, flight.l1, e)) / (1 + flight.pull * Math.sin(Math.PI * t));
        cam.s = s;
        cam.tx = innerWidth / 2 - lerp(flight.c0.x, flight.c1.x, e) * s;
        cam.ty = innerHeight / 2 - lerp(flight.c0.y, flight.c1.y, e) * s;
        if (t >= 1) {
            Object.assign(cam, flight.to);
            flight = null;
            world.classList.remove('moving');
            for (const landed of landings.splice(0)) setTimeout(landed);
        }
        apply();
    }
    if (field && !picker) {
        for (const pane of field.panes) pane.radius = radius * cam.s;
        field.glass.bevel = Math.max(7, RIM.bevel * cam.s);
        field.glass.refraction = Math.max(9, RIM.refraction * cam.s);
    }
    moveOrb(dt);
}

// Run something once the camera is still
function afterLanding(callback) {
    if (flight) landings.push(callback);
    else setTimeout(callback);
}

// Fly to a camera { tx, ty, s }. The point at the middle of the screen travels in a straight
// line while the scale eases between the two; on a long trip the scale dips on the way,
// enough to keep both ends in sight at the halfway mark.
function flyTo(to, instant = false) {
    if (instant || REDUCE_MOTION) {
        flight = null;
        Object.assign(cam, to);
        world.classList.remove('moving');
        apply();
        return;
    }
    const vw = innerWidth;
    const vh = innerHeight;
    const c0 = { x: (vw / 2 - cam.tx) / cam.s, y: (vh / 2 - cam.ty) / cam.s };
    const c1 = { x: (vw / 2 - to.tx) / to.s, y: (vh / 2 - to.ty) / to.s };
    const travel = Math.hypot(c1.x - c0.x, c1.y - c0.y);
    const middle = Math.sqrt(cam.s * to.s);
    const fit = (Math.min(vw, vh) * 0.7) / (travel || 1);
    const pull = Math.min(2, Math.max(0, middle / fit - 1));
    flight = { start: performance.now(), duration: 720 + 380 * Math.min(1, pull), c0, c1, l0: Math.log(cam.s), l1: Math.log(to.s), pull, to };
    world.classList.add('moving');
}

// ---------- Start: the field, the orb, the photo ----------

// The language picker first, on a first visit to the English page (the head decides)
let picker = root.classList.contains('picking') ? { level: 1, leaving: false } : null;
const deferField = !location.hash && !REDUCE_MOTION;
const field = createField(picker || deferField ? MAP : HOME);
initTheme();
initLanguageMemory();
initBlogToggles();
initExternalLinks();

const orb = document.querySelector('.orb');
const orbRings = orb.querySelector('.orb-rings');
const orbCore = orb.querySelector('.orb-core');
const orbIcon = orb.querySelector('.orb-icon');
const orbTip = orb.querySelector('.orb-tip-text');
// The orb takes its own presses (to carry it), so the rings don't grab them
const rings = new GlassRings(orbRings, { reduceMotion: REDUCE_MOTION, grab: false });
rings.start();
// Ali's photo, alive: he breathes and his head drifts a little, nothing more
livePhoto(document.querySelector('.home-photo img'), { reduceMotion: REDUCE_MOTION });

if (field) field.onFrame(() => tick(performance.now()));
else requestAnimationFrame(function loop(now) {
    tick(now);
    requestAnimationFrame(loop);
});

// ---------- The orb ----------

// The rings are drawn at one size and scaled to the slot: a new size would repaint them
const ORB = 150;
const orbAt = { x: 0, y: 0, vx: 0, vy: 0, size: 132, vs: 0, away: false, placed: false };
const written = { transform: '', rings: '', size: '' };

function orbTarget() {
    // Carried: under the pointer where it was picked up, lifted a little
    if (carry?.moved) return { x: carry.px - carry.dx, y: carry.py - carry.dy, size: Math.min(ORB, carry.size * 1.12) };
    const slot = panes.get(current).querySelector('.orb-slot');
    const box = slot.getBoundingClientRect();
    const size = Math.min(ORB, Math.max(phone.matches ? 72 : 64, box.width));
    // Off screen it waits at the nearest edge, pointing the way back
    const margin = 8 + size / 2;
    return {
        x: Math.min(innerWidth - margin, Math.max(margin, box.left + box.width / 2)),
        y: Math.min(innerHeight - margin, Math.max(margin, box.top + box.height / 2)),
        size,
    };
}

// On springs a little short of critical damping, so it overshoots a touch and settles
function moveOrb(dt) {
    const target = orbTarget();
    const o = orbAt;
    if (!o.placed || REDUCE_MOTION) {
        Object.assign(o, { x: target.x, y: target.y, size: target.size, vx: 0, vy: 0, vs: 0, placed: true });
    } else {
        // Carried, it keeps closer to the pointer, and swings more
        const k = carry?.moved ? 360 : 130;
        const c = 2 * (carry?.moved ? 0.62 : 0.74) * Math.sqrt(k);
        o.vx += (k * (target.x - o.x) - c * o.vx) * dt;
        o.vy += (k * (target.y - o.y) - c * o.vy) * dt;
        o.vs += (220 * (target.size - o.size) - 2 * 0.9 * Math.sqrt(220) * o.vs) * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        o.size += o.vs * dt;
    }
    const distance = Math.hypot(target.x - o.x, target.y - o.y);
    if (distance > 60) o.away = true;
    // Home again: the rings ring
    if (o.away && distance < 2 && Math.hypot(o.vx, o.vy) < 40) {
        o.away = false;
        rings.poke();
    }
    // Stretched along its way, the faster the more, like a drop
    const speed = Math.hypot(o.vx, o.vy);
    const stretch = Math.min(carry?.moved ? 0.24 : 0.16, speed / 7000);
    const angle = Math.atan2(o.vy, o.vx);
    const scale = o.size / ORB;
    write('transform', orb, 'transform', `translate(${(o.x - ORB / 2).toFixed(1)}px, ${(o.y - ORB / 2).toFixed(1)}px)`);
    write('rings', orbRings, 'transform', stretch > 0.004
        ? `rotate(${angle.toFixed(3)}rad) scale(${(scale * (1 + stretch)).toFixed(4)}, ${(scale * (1 - stretch * 0.55)).toFixed(4)}) rotate(${(-angle).toFixed(3)}rad)`
        : `scale(${scale.toFixed(4)})`);
    write('size', orb, '--orb-size', `${o.size.toFixed(1)}px`);
    // Near the left edge its label goes on its right
    const right = o.x < 320;
    if (right !== written.right) {
        written.right = right;
        orb.classList.toggle('tip-right', right);
    }
}

function write(key, element, property, value) {
    if (written[key] === value) return;
    written[key] = value;
    element.style.setProperty(property, value);
}

// What the orb's middle shows
const ICONS = {
    home: 'fa-hand', about: 'fa-user', experience: 'fa-briefcase', projects: 'fa-flask', skills: 'fa-code',
    education: 'fa-graduation-cap', publications: 'fa-book-open', blog: 'fa-pen-nib', interests: 'fa-futbol',
    map: 'fa-location-dot', ask: 'fa-wand-magic-sparkles',
};

// The middle flips over like a coin to its new face
function showIcon(key) {
    if (orb.dataset.icon === key) return;
    const first = !orb.dataset.icon;
    orb.dataset.icon = key;
    const swap = () => {
        orbIcon.classList.remove(...Object.values(ICONS));
        orbIcon.classList.add(ICONS[key]);
    };
    if (first || REDUCE_MOTION) return swap();
    orbIcon.getAnimations().forEach(animation => animation.cancel());
    orbIcon.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg) scale(0.85)' }], { duration: 150, easing: 'ease-in' }).finished.then(() => {
        swap();
        orbIcon.animate([
            { transform: 'rotateY(-90deg) scale(0.85)' },
            { transform: 'rotateY(16deg) scale(1.12)', offset: 0.65 },
            { transform: 'rotateY(0deg) scale(1)' },
        ], { duration: 460, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
    }, () => {});
}

function orbState() {
    if (ask?.isOpen()) return;
    showIcon(mode === 'map' ? 'map' : current);
    orbTip.textContent = mode === 'map' ? ALINO.here : ALINO.tip;
    orb.classList.toggle('here', mode === 'map');
}

// ---------- Where you are ----------

function mark(id) {
    for (const button of railButtons) {
        if (button.dataset.go === id) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
    }
    for (const wire of wires.children) wire.classList.toggle('active', mode === 'focus' && (id === 'home' || wire.dataset.to === id));
    wires.classList.toggle('all', id === 'home' || mode === 'map');
    markMinimap();
    // On phones the row of names follows along
    const button = railButtons.find(b => b.dataset.go === id);
    if (phone.matches && button) button.scrollIntoView({ inline: 'center', block: 'nearest', behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
}

function updateStepper() {
    const index = SEQUENCE.indexOf(current);
    const prev = SEQUENCE[index - 1];
    const next = SEQUENCE[index + 1] ?? SEQUENCE[0];
    const [prevButton, nextButton] = stepper.querySelectorAll('.step');
    prevButton.hidden = !prev;
    if (prev) prevButton.querySelector('.step-name').textContent = panes.get(prev).dataset.title;
    nextButton.querySelector('.step-name').textContent = next === 'home' ? UI.canvas.back_to_start : panes.get(next).dataset.title;
    stepper.querySelector('.step-count').textContent = index
        ? digits(`${String(index).padStart(2, '0')} / ${String(SEQUENCE.length - 1).padStart(2, '0')}`)
        : UI.canvas.start;
}

function focus(id, { instant = false, push = true } = {}) {
    const g = geometry.get(id);
    if (!g) return;
    const box = stage();
    const s = phone.matches ? 1 : Math.min(1, box.width / g.w, box.height / g.h);
    const cx = box.left + box.width / 2;
    const cy = phone.matches ? 62 + g.h / 2 : box.top + box.height / 2;
    flyTo({ s, tx: cx - g.x * s, ty: cy - g.y * s }, instant);
    const fresh = current !== id || mode !== 'focus';
    mode = 'focus';
    current = id;
    document.body.classList.add('focus-mode');
    document.body.classList.remove('map-mode');
    for (const [key, pane] of panes) pane.classList.toggle('focused', key === id);
    mark(id);
    updateStepper();
    field?.morphTo(id === 'home' ? HOME : IDS.indexOf(id));
    orbState();
    const title = panes.get(id).querySelector('.section-title span');
    if (title && fresh) setTimeout(() => scramble(title), instant ? 0 : 450);
    if (push) history.replaceState(null, '', id === 'home' ? location.pathname + location.search : `#${id}`);
    // Analytics counts attention by the section in view
    if (fresh) {
        document.body.dataset.section = id;
        document.dispatchEvent(new CustomEvent('portfolio:section', { detail: { section: id } }));
    }
}

function overviewCamera() {
    const { minX, minY, maxX, maxY } = bounds();
    const box = stage();
    const s = Math.min((box.width - 40) / (maxX - minX), (box.height - 20) / (maxY - minY));
    return { s, tx: box.left + box.width / 2 - ((minX + maxX) / 2) * s, ty: box.top + box.height / 2 - ((minY + maxY) / 2) * s };
}

function overview(instant = false) {
    flyTo(overviewCamera(), instant);
    mode = 'map';
    document.body.classList.add('map-mode');
    document.body.classList.remove('focus-mode');
    for (const pane of panes.values()) pane.classList.remove('focused');
    mark('overview');
    field?.morphTo(MAP);
    orbState();
}

function step(direction) {
    const index = SEQUENCE.indexOf(current);
    focus(SEQUENCE[(index + direction + SEQUENCE.length) % SEQUENCE.length]);
}

// The pane that lies most nearly in a direction from the one in view
function neighbour(dx, dy) {
    const from = geometry.get(current);
    let best = null;
    let score = Infinity;
    for (const [id, g] of geometry) {
        const vx = g.x - from.x;
        const vy = g.y - from.y;
        const distance = Math.hypot(vx, vy);
        const along = (vx * dx + vy * dy) / (distance || 1);
        if (id === current || along <= 0.3) continue;
        const value = distance * (1 + 2 * (1 - along));
        if (value < score) { score = value; best = id; }
    }
    if (best) focus(best);
}

// Fly to a pane, bring a line of it into view, then do something there
function goTo(id, element, then) {
    focus(id);
    afterLanding(() => {
        const body = element?.closest('.pane-body');
        if (body) {
            const offset = (element.getBoundingClientRect().top - body.getBoundingClientRect().top) / cam.s;
            body.scrollTo({ top: Math.max(0, body.scrollTop + offset - body.clientHeight * 0.3), behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
        }
        then?.();
    });
}

// A long pane fades at its foot while there is more of it below
for (const body of document.querySelectorAll('.pane-body')) {
    const more = () => {
        body.classList.toggle('more', body.scrollTop + body.clientHeight < body.scrollHeight - 4);
        body.classList.toggle('scrolled', body.scrollTop > 4);
    };
    body.addEventListener('scroll', more, { passive: true });
    new ResizeObserver(more).observe(body);
}

// ---------- Alino ----------

const ask = initAsk({
    panel: document.querySelector('.ask'),
    panes,
    anchor: () => ({ x: orbAt.x, y: orbAt.y, size: orbAt.size }),
    // Fly to a pane, bring the line into its view and light it
    go: goTo,
    onToggle(open) {
        orbCore.setAttribute('aria-expanded', open);
        orb.classList.toggle('asking', open);
        if (open) {
            showIcon('ask');
            met();
        } else {
            orbState();
        }
    },
});

// The latest news on Ali's pane opens the updates under About
const news = document.querySelector('.home-news');
news?.addEventListener('click', () => {
    interacted();
    goTo('about', ask.lineOf(news.dataset.news), () => ask.light(news.dataset.news));
});

// ---------- Alino calls out ----------

// Until the visitor has opened Alino once, the orb wears a badge; and until they have asked
// something this visit, Alino pipes up now and then in a bubble beside the orb: a moment of
// "typing", then a line (some about the section in view), and the rings ripple as it speaks
const badge = orb.querySelector('.orb-badge');
const say = orb.querySelector('.orb-say');
const sayText = say.querySelector('.orb-say-text');
const NUDGES = ALINO.nudges ?? [];
const SECTION_NUDGES = ALINO.section_nudges ?? {};
let said = 0;
let sayTimer = 0;
let lastLine = -1;

function met() {
    badge.hidden = true;
    hideSay();
    try { localStorage.setItem('alino:met', '1'); } catch {}
}
try { badge.hidden = localStorage.getItem('alino:met') === '1'; } catch {}

function hideSay() {
    say.classList.remove('on', 'typing');
}

function callOut() {
    clearTimeout(sayTimer);
    if (said >= 5 || ask.asked() || !NUDGES.length) return;
    // Not while the visitor is choosing a language, busy with Alino, carrying it, or on the map
    if (picker || ask.isOpen() || carry?.moved || mode !== 'focus' || document.hidden) {
        sayTimer = setTimeout(callOut, 8000);
        return;
    }
    said++;
    let line = SECTION_NUDGES[current] && Math.random() < 0.6 ? SECTION_NUDGES[current] : null;
    if (!line) {
        let index = Math.floor(Math.random() * NUDGES.length);
        if (index === lastLine) index = (index + 1) % NUDGES.length;
        lastLine = index;
        line = NUDGES[index];
    }
    sayText.textContent = '';
    say.classList.add('on', 'typing');
    if (!REDUCE_MOTION) rings.poke();
    setTimeout(() => {
        sayText.textContent = line;
        say.classList.remove('typing');
    }, 900);
    setTimeout(hideSay, 7500);
    sayTimer = setTimeout(callOut, 38000 + Math.random() * 30000);
}
say.addEventListener('click', () => {
    hideSay();
    ask.open(orbCore);
});

// ---------- Carrying the orb ----------

// A press that doesn't move is a tap, and opens Alino; one that moves picks the orb up
let carry = null;

// What lies under the pointer that the orb can be dropped on: another pane, or a name in the
// rail or the small map
function dropTarget(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
        if (el.closest('.orb')) continue;
        const target = el.closest('.rail-item[data-go], .mm-pane[data-pane]');
        if (target) return { id: target.dataset.go ?? target.dataset.pane, el: target };
        const pane = el.closest('.pane');
        if (pane && (pane.id !== current || mode === 'map')) return { id: pane.id, el: pane };
        if (el.closest('.rail, .stepper, .ask, .canvas-top')) return null;
    }
    return null;
}

function markDrop(target, on) {
    if (!target) return;
    target.el.classList.toggle('drop-target', on);
    // A pane's glass takes the tint the field gives the active pane
    if (target.el.classList.contains('pane')) target.el.classList.toggle('active', on);
}

orb.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button > 0) return;
    event.preventDefault();
    interacted();
    carry = { id: event.pointerId, x: event.clientX, y: event.clientY, px: event.clientX, py: event.clientY, dx: event.clientX - orbAt.x, dy: event.clientY - orbAt.y, size: orbAt.size, moved: false, drop: null };
});
addEventListener('pointermove', event => {
    if (!carry || event.pointerId !== carry.id) return;
    carry.px = event.clientX;
    carry.py = event.clientY;
    if (!carry.moved) {
        if (Math.hypot(event.clientX - carry.x, event.clientY - carry.y) < 6) return;
        carry.moved = true;
        ask.close(false);
        hideSay();
        orb.classList.add('carried');
        root.classList.add('orb-carried');
        rings.poke();
    }
    const target = dropTarget(event.clientX, event.clientY);
    if (target?.el !== carry.drop?.el) {
        markDrop(carry.drop, false);
        markDrop(target, true);
        carry.drop = target;
        orbTip.textContent = target ? ALINO.take_me.replace('{place}', panes.get(target.id)?.dataset.title ?? ALINO.the_map) : ALINO.let_go;
    }
});
function letGo(event) {
    if (!carry || event.pointerId !== carry.id) return;
    const { moved, drop } = carry;
    carry = null;
    if (!moved) {
        if (event.type === 'pointerup') ask.toggle(orbCore);
        return;
    }
    orb.classList.remove('carried');
    root.classList.remove('orb-carried');
    markDrop(drop, false);
    // The click that ends a carry is the orb's, not the button's under it
    const swallow = click => { click.stopPropagation(); click.preventDefault(); };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, { capture: true }));
    orbAt.away = true;
    if (drop && event.type === 'pointerup' && panes.has(drop.id)) focus(drop.id);
    else orbState();
}
addEventListener('pointerup', letGo);
addEventListener('pointercancel', letGo);
// From the keyboard the middle opens Alino (a pointer's tap is handled above)
orbCore.addEventListener('click', event => {
    if (event.detail === 0) ask.toggle(orbCore);
});

// ---------- Input ----------

// The browser scrolls a box to show a #link's target or a focused link, even one that hides
// its overflow; here only the camera moves
viewport.addEventListener('scroll', () => {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
});
// Tabbing into a pane brings it into view
viewport.addEventListener('focusin', event => {
    const pane = event.target.closest('.pane');
    if (pane && (pane.id !== current || mode !== 'focus')) focus(pane.id);
});

// The first move of any kind puts the hint away
let hinted = false;
function interacted() {
    if (hinted) return;
    hinted = true;
    clearTimeout(intro);
    document.body.classList.add('hint-done');
}

for (const button of railButtons) {
    button.addEventListener('click', event => {
        interacted();
        const target = event.target.closest('[data-pane]');
        if (target) focus(target.dataset.pane);
        else if (button.dataset.go === 'overview') overview();
        else focus(button.dataset.go);
    });
}
for (const button of stepper.querySelectorAll('.step')) {
    button.addEventListener('click', () => { interacted(); step(+button.dataset.step); });
}

// Drag to pan; a press that doesn't move picks the pane under it. On phones the row follows
// the finger and lets go onto the next or previous pane, or back.
let drag = null;
viewport.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.target.closest('a, button, input')) return;
    drag = { x: event.clientX, y: event.clientY, tx: cam.tx, ty: cam.ty, moved: false, target: event.target, mouse: event.pointerType === 'mouse' };
});
addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    // A mouse in the pane being read selects its text instead
    if (!drag.moved && drag.mouse && drag.target.closest('.focused .pane-body')) {
        drag = null;
        return;
    }
    if (!drag.moved) {
        drag.moved = true;
        flight = null;
        interacted();
        viewport.classList.add('dragging');
        world.classList.add('moving');
    }
    cam.tx = drag.tx + dx;
    cam.ty = drag.ty + dy;
    apply();
});
function release(event, cancelled) {
    if (!drag) return;
    const { moved, target, x, y } = drag;
    drag = null;
    viewport.classList.remove('dragging');
    world.classList.remove('moving');
    // On a phone, reading a pane: a swipe goes to the pane on the side it pulls in from, as
    // on a map; a short one, or toward no pane, springs back
    if (phone.matches && mode === 'focus') {
        if (!moved) return;
        const dx = event.clientX - x;
        const dy = event.clientY - y;
        const before = current;
        if (!cancelled && Math.max(Math.abs(dx), Math.abs(dy)) > 50) {
            if (Math.abs(dx) > Math.abs(dy)) neighbour(dx < 0 ? 1 : -1, 0);
            else neighbour(0, dy < 0 ? 1 : -1);
        }
        if (current === before) focus(current, { push: false });
        return;
    }
    if (moved || cancelled) return;
    const pane = target.closest('.pane');
    if (pane && (mode === 'map' || !pane.classList.contains('focused'))) {
        interacted();
        focus(pane.id);
    }
}
addEventListener('pointerup', event => release(event, false));
addEventListener('pointercancel', event => release(event, true));

// Two fingers: pinching in shows the whole map, spreading them on the map flies into the pane
// between them
const touches = new Map();
let pinch = null;
viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
        // The first finger's drag gives way to the pinch
        drag = null;
        viewport.classList.remove('dragging');
        world.classList.remove('moving');
        const [a, b] = [...touches.values()];
        pinch = { start: Math.hypot(a.x - b.x, a.y - b.y), done: false };
    }
});
addEventListener('pointermove', event => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinch || pinch.done || touches.size !== 2) return;
    const [a, b] = [...touches.values()];
    const ratio = Math.hypot(a.x - b.x, a.y - b.y) / (pinch.start || 1);
    if (ratio < 0.72 && mode === 'focus') {
        pinch.done = true;
        interacted();
        overview();
    } else if (ratio > 1.35 && mode === 'map') {
        pinch.done = true;
        interacted();
        const pane = document.elementsFromPoint((a.x + b.x) / 2, (a.y + b.y) / 2).find(el => el.closest('.pane'))?.closest('.pane');
        focus(pane?.id ?? current);
    }
}, { passive: true });
const lift = event => {
    touches.delete(event.pointerId);
    if (touches.size < 2) pinch = null;
};
addEventListener('pointerup', lift);
addEventListener('pointercancel', lift);

// On a phone, the first visit says how to get around, for a moment
function touchHint() {
    if (!phone.matches || !UI.canvas?.touch_hint) return;
    try {
        if (localStorage.getItem('canvas:touch-hint')) return;
        localStorage.setItem('canvas:touch-hint', '1');
    } catch {}
    const hint = Object.assign(document.createElement('p'), { className: 'touch-hint', textContent: UI.canvas.touch_hint });
    hint.setAttribute('aria-hidden', 'true');
    document.body.append(hint);
    requestAnimationFrame(() => hint.classList.add('on'));
    setTimeout(() => hint.classList.remove('on'), 5200);
    setTimeout(() => hint.remove(), 6000);
}

// The wheel reads the pane in view; a fresh turn of it at the pane's end, or anywhere off the
// pane, steps to the next or previous one. In the overview it zooms; with Ctrl (or a pinch)
// it zooms anywhere.
const gesture = { last: 0, sum: 0, used: false, scrolled: false };
viewport.addEventListener('wheel', event => {
    const now = performance.now();
    if (now - gesture.last > 260) Object.assign(gesture, { sum: 0, used: false, scrolled: false });
    gesture.last = now;
    interacted();
    if (event.ctrlKey || mode === 'map') {
        event.preventDefault();
        const floor = Math.min(overviewCamera().s, 0.2) * 0.85;
        const s = Math.min(1.25, Math.max(floor, cam.s * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002))));
        flight = null;
        cam.tx = event.clientX - (event.clientX - cam.tx) * (s / cam.s);
        cam.ty = event.clientY - (event.clientY - cam.ty) * (s / cam.s);
        cam.s = s;
        apply();
        return;
    }
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX * (RTL ? -1 : 1) : event.deltaY;
    const body = event.target.closest('.focused .pane-body');
    if (body && body.scrollHeight > body.clientHeight + 2) {
        const atEnd = delta > 0 ? body.scrollTop + body.clientHeight >= body.scrollHeight - 2 : body.scrollTop <= 2;
        if (!atEnd) {
            gesture.scrolled = true;
            return;
        }
        // A scroll that ran into the end stops there; the next turn moves on
        if (gesture.scrolled) {
            event.preventDefault();
            return;
        }
    }
    event.preventDefault();
    if (gesture.used) return;
    gesture.sum += delta;
    if (Math.abs(gesture.sum) < 40) return;
    gesture.used = true;
    step(gesture.sum > 0 ? 1 : -1);
}, { passive: false });

document.addEventListener('keydown', event => {
    if (picker || event.target.closest('input, textarea') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === '/') {
        event.preventDefault();
        interacted();
        ask.open(orbCore);
        return;
    }
    const moves = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const inPane = event.target.closest('.pane-body');
    if (moves[event.key] && !inPane) {
        event.preventDefault();
        interacted();
        if (mode === 'map') focus(current);
        else neighbour(...moves[event.key]);
    } else if (event.key === 'PageDown' || event.key === 'PageUp') {
        event.preventDefault();
        interacted();
        step(event.key === 'PageDown' ? 1 : -1);
    } else if (event.key === 'Escape') {
        interacted();
        if (mode === 'map') focus(current);
        else overview();
    } else if (event.key === 'Home' && !inPane) {
        interacted();
        focus('home');
    }
});

addEventListener('resize', () => {
    layout();
    if (mode === 'map') overview(true);
    else focus(current, { instant: true, push: false });
});
addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (panes.has(id)) focus(id);
});

// ---------- The language picker ----------

// On a first visit to the English page (styles.css): a glass pane for each language over the
// field's globe. Each greeting scrambles in, and again as its pane is hovered. Choosing a pane
// widens it over the others; English then lets the panes fall away onto the canvas as the
// globe dissolves, and the others go to their page. Escape stays on English without
// remembering a choice, and the arrow keys move between panes.
function initPicker(then) {
    const dialog = document.querySelector('.language-picker');
    if (!dialog || !picker) {
        picker = null;
        return then();
    }
    const picks = [...dialog.querySelectorAll('.pick')];
    const behind = document.querySelectorAll('.viewport, .rail, .stepper, .orb, .ask, .canvas-top, .canvas-foot');
    for (const element of behind) element.inert = true;
    dialog.focus({ preventScroll: true });
    const wait = ms => (REDUCE_MOTION ? 0 : ms);

    // Persian scrambles through its own words' letters, the only ones this page loads
    picks.forEach((pick, i) => {
        const word = pick.querySelector('.pick-word');
        const text = word.textContent;
        const glyphs = pick.hreflang === 'fa' ? [...new Set(pick.textContent.replace(/[^؀-ۿ]/g, ''))].join('') : LATIN_GLYPHS;
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
        setTimeout(() => {
            picker = null;
            dialog.remove();
            root.classList.remove('picking');
            for (const element of behind) element.inert = false;
            field?.setGlass(panes.values());
            then();
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
            const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
            const next = from < 0 ? (direction > 0 ? 0 : picks.length - 1) : (from + direction + picks.length) % picks.length;
            picks[next].focus();
            event.preventDefault();
        }
    });
}

// ---------- Start ----------

layout();
const start = location.hash.slice(1);
// Until the picker has gone, the camera rests on the whole map
if (picker) overview(true);

initPicker(() => {
    if (panes.has(start) || !deferField) {
        focus(panes.has(start) ? start : 'home', { instant: true, push: false });
    } else {
        // First the whole map, so the layout is clear at a glance; then into Ali's pane
        overview(true);
        intro = setTimeout(() => focus('home', { push: false }), 1100);
    }
    scramble(document.querySelector('.home-name'), undefined, 900);
    // The orb says what it does, for a moment
    orb.classList.add('tip-show');
    setTimeout(() => orb.classList.remove('tip-show'), 5200);
    sayTimer = setTimeout(callOut, deferField ? 6500 : 4500);
    setTimeout(touchHint, deferField ? 2200 : 600);
});
