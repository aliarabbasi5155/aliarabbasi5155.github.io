// Concept 2, the spatial canvas (lab only). The camera is the world's transform: focusing
// a pane flies it to the middle of the screen at a size that fits; the overview fits the
// whole map. The field takes the shape of the pane in view, and a globe for the map.
import { GlassRings } from '../glass-rings.js';
import { SCENES, REDUCE_MOTION, createField, initTheme, scramble, initBlogToggles, initExternalLinks } from './concepts.js';

const IDS = Object.keys(SCENES);
const ORDER = [...IDS, { shape: 'ripples', wide: [0.3, 0, 1], tall: [0, 0.1, 0.9] }, { shape: 'globe', wide: [0, 0, 1.15], tall: [0, 0, 1] }];
const HOME = IDS.length;
const MAP = HOME + 1;
// The CV's own order, for next and previous and the phone's row
const SEQUENCE = ['home', 'about', 'experience', 'projects', 'skills', 'education', 'publications', 'blog', 'interests'];

const field = createField(ORDER, { initial: HOME });
initTheme(() => field);
initBlogToggles();
initExternalLinks();
new GlassRings(document.querySelector('.home-rings'), { reduceMotion: REDUCE_MOTION }).start();

const viewport = document.querySelector('.viewport');
const world = document.querySelector('.world');
const links = document.querySelector('.links');
const where = document.querySelector('.canvas-where');
const panes = new Map([...document.querySelectorAll('.pane')].map(pane => [pane.id, pane]));
const railButtons = [...document.querySelectorAll('.rail button')];
const phone = window.matchMedia('(max-width: 760px)');
const geometry = new Map();
const cam = { tx: 0, ty: 0, s: 1 };
let mode = 'focus';
let current = 'home';

function layout() {
    const vw = innerWidth;
    const vh = innerHeight;
    for (const [id, pane] of panes) {
        const g = phone.matches
            ? { x: SEQUENCE.indexOf(id) * (vw + 40), y: 0, w: vw - 24, h: vh - 136 }
            : { x: +pane.dataset.x, y: +pane.dataset.y, w: +pane.dataset.w, h: +pane.dataset.h };
        geometry.set(id, g);
        Object.assign(pane.style, { left: `${g.x - g.w / 2}px`, top: `${g.y - g.h / 2}px`, width: `${g.w}px`, height: `${g.h}px` });
    }
    // Dashed lines from Ali to every pane, on the map
    links.replaceChildren(...(phone.matches ? [] : [...geometry].filter(([id]) => id !== 'home').map(([, g]) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', 0);
        line.setAttribute('y1', 0);
        line.setAttribute('x2', g.x);
        line.setAttribute('y2', g.y);
        return line;
    })));
}

function move(fly) {
    world.classList.toggle('flying', fly && !REDUCE_MOTION);
    world.style.transform = `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`;
}

function mark(id) {
    for (const button of railButtons) {
        if (button.dataset.go === id) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
    }
}

function focus(id, { fly = true, push = true } = {}) {
    const g = geometry.get(id);
    if (!g) return;
    const vw = innerWidth;
    const vh = innerHeight;
    const s = phone.matches ? 1 : Math.min(1, (vw - 220) / g.w, (vh - 110) / g.h);
    const cx = phone.matches ? vw / 2 : vw / 2 + 32;
    const cy = phone.matches ? 62 + g.h / 2 : vh / 2 + 6;
    Object.assign(cam, { s, tx: cx - g.x * s, ty: cy - g.y * s });
    move(fly);
    mode = 'focus';
    current = id;
    document.body.classList.add('focus-mode');
    document.body.classList.remove('map-mode');
    for (const [key, pane] of panes) pane.classList.toggle('focused', key === id);
    mark(id);
    field?.morphTo(id === 'home' ? HOME : IDS.indexOf(id));
    const title = panes.get(id).querySelector('.section-title span');
    where.textContent = title ? title.textContent : '';
    if (title) setTimeout(() => scramble(title), fly ? 500 : 0);
    if (push) history.replaceState(null, '', id === 'home' ? location.pathname : `#${id}`);
}

function overview() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of geometry.values()) {
        minX = Math.min(minX, g.x - g.w / 2); maxX = Math.max(maxX, g.x + g.w / 2);
        minY = Math.min(minY, g.y - g.h / 2); maxY = Math.max(maxY, g.y + g.h / 2);
    }
    const s = Math.min((innerWidth - 160) / (maxX - minX), (innerHeight - 140) / (maxY - minY));
    Object.assign(cam, { s, tx: innerWidth / 2 - ((minX + maxX) / 2) * s, ty: innerHeight / 2 - ((minY + maxY) / 2) * s });
    move(true);
    mode = 'map';
    document.body.classList.add('map-mode');
    document.body.classList.remove('focus-mode');
    for (const pane of panes.values()) pane.classList.remove('focused');
    mark('overview');
    where.textContent = 'The whole map';
    field?.morphTo(MAP);
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

for (const button of railButtons) {
    button.addEventListener('click', () => (button.dataset.go === 'overview' ? overview() : focus(button.dataset.go)));
}

// Drag to pan; a press that doesn't move picks the pane under it; on phones a swipe
// steps to the next or previous pane
let drag = null;
viewport.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.target.closest('a, button, input')) return;
    if (mode === 'focus' && event.target.closest('.focused .pane-body') && event.pointerType !== 'mouse') return;
    drag = { x: event.clientX, y: event.clientY, tx: cam.tx, ty: cam.ty, moved: false, target: event.target };
});
window.addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved && drag.target.closest('.focused .pane-body')) {
        drag = null;
        return;
    }
    drag.moved = true;
    viewport.classList.add('dragging');
    if (phone.matches) return;
    cam.tx = drag.tx + dx;
    cam.ty = drag.ty + dy;
    move(false);
});
window.addEventListener('pointerup', event => {
    if (!drag) return;
    const { moved, target, x, y } = drag;
    drag = null;
    viewport.classList.remove('dragging');
    if (phone.matches && moved) {
        const dx = event.clientX - x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(event.clientY - y)) step(dx < 0 ? 1 : -1);
        return;
    }
    if (moved) return;
    const pane = target.closest('.pane');
    if (pane && (mode === 'map' || !pane.classList.contains('focused'))) focus(pane.id);
});

// The wheel scrolls the pane in view; anywhere else it steps through the panes, and with
// Ctrl (or a pinch) it zooms
let wheelAt = 0;
viewport.addEventListener('wheel', event => {
    const body = event.target.closest('.focused .pane-body');
    if (body && body.scrollHeight > body.clientHeight && !event.ctrlKey) return;
    event.preventDefault();
    if (event.ctrlKey) {
        const factor = Math.exp(-event.deltaY * 0.004);
        const s = Math.min(1.4, Math.max(0.12, cam.s * factor));
        cam.tx = event.clientX - (event.clientX - cam.tx) * (s / cam.s);
        cam.ty = event.clientY - (event.clientY - cam.ty) * (s / cam.s);
        cam.s = s;
        move(false);
        return;
    }
    const now = performance.now();
    if (now - wheelAt < 800 || Math.abs(event.deltaY) + Math.abs(event.deltaX) < 8) return;
    wheelAt = now;
    if (mode === 'map') focus(current);
    else step((Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) > 0 ? 1 : -1);
}, { passive: false });

document.addEventListener('keydown', event => {
    if (event.target.closest('input, textarea')) return;
    const moves = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (moves[event.key] && !event.target.closest('.pane-body')) {
        event.preventDefault();
        if (phone.matches) step(event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1);
        else neighbour(...moves[event.key]);
    } else if (event.key === 'Escape') {
        if (mode === 'map') focus(current);
        else overview();
    } else if (event.key === 'Home') {
        focus('home');
    }
});

window.addEventListener('resize', () => {
    layout();
    if (mode === 'map') overview();
    else focus(current, { fly: false, push: false });
});
window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (panes.has(id)) focus(id);
});

layout();
const start = location.hash.slice(1);
focus(panes.has(start) ? start : 'home', { fly: false, push: false });
scramble(document.querySelector('.home-name'), undefined, 900);
