// Concept 2, the spatial canvas (lab only). The camera is the world's transform, moved
// here frame by frame: focusing a pane flies it to the middle of the free screen at a size
// that fits, pulling back on the way when the trip is long, so you see where you go; the
// overview fits the whole map. Wires run from Ali's pane to every section, edge to edge,
// like a node graph, and the one to the pane in view lights up. The rail lists the panes by
// name over a small map that shows what is on screen. The field takes the shape of the
// pane in view, and a globe for the map.
import { GlassRings } from '../glass-rings.js';
import { SCENES, REDUCE_MOTION, createField, initTheme, scramble, initBlogToggles, initExternalLinks } from './concepts.js';

const IDS = Object.keys(SCENES);
const ORDER = [...IDS, { shape: 'ripples', wide: [0.3, 0, 1], tall: [0, 0.1, 0.9] }, { shape: 'globe', wide: [0, 0, 1.15], tall: [0, 0, 1] }];
const HOME = IDS.length;
const MAP = HOME + 1;
const SVG = 'http://www.w3.org/2000/svg';

const viewport = document.querySelector('.viewport');
const world = document.querySelector('.world');
const wires = document.querySelector('.wires');
const rail = document.querySelector('.rail');
const minimap = document.querySelector('.minimap');
const stepper = document.querySelector('.stepper');
const panes = new Map([...document.querySelectorAll('.pane')].map(pane => [pane.id, pane]));
// Ali, then the sections in the CV's order (the page's order), for next and previous
const SEQUENCE = [...panes.keys()];
const railButtons = [...document.querySelectorAll('[data-go]')];
const phone = window.matchMedia('(max-width: 760px)');
const geometry = new Map();
const cam = { tx: 0, ty: 0, s: 1 };
// The panes' corners, in world pixels (canvas.css), and the glass's rim: the field draws
// the glass on screen, so both are scaled here with the view, and a pane keeps its shape
let radius = 44;
const RIM = { bevel: 28, refraction: 34 };
let flight = null;
let mode = 'focus';
let current = 'home';
let frame = null;
let intro = 0;

// ?radius=32 tries other corners (world pixels)
const tryRadius = Number(new URLSearchParams(location.search).get('radius'));
if (tryRadius > 0) document.body.style.setProperty('--pane-radius', `${tryRadius}px`);

const deferField = !location.hash && !REDUCE_MOTION;
const field = createField(ORDER, { initial: deferField ? MAP : HOME });
initTheme(() => field);
initBlogToggles();
initExternalLinks();
new GlassRings(document.querySelector('.home-rings'), { reduceMotion: REDUCE_MOTION }).start();

const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// The part of the screen the panes have: right of the rail, clear of the top and bottom bars
function stage() {
    const vw = innerWidth;
    const vh = innerHeight;
    if (phone.matches) return { left: 0, top: 0, width: vw, height: vh };
    const left = rail.getBoundingClientRect().right + 24;
    const top = 72;
    const bottom = 84;
    return { left, top, width: vw - left - 28, height: vh - top - bottom };
}

function layout() {
    const vw = innerWidth;
    const vh = innerHeight;
    radius = parseFloat(getComputedStyle(panes.get('home')).borderTopLeftRadius) || radius;
    for (const [id, pane] of panes) {
        const g = phone.matches
            ? { x: SEQUENCE.indexOf(id) * (vw + 40), y: 0, w: vw - 24, h: vh - 136 }
            : { x: +pane.dataset.x, y: +pane.dataset.y, w: +pane.dataset.w, h: +pane.dataset.h };
        geometry.set(id, g);
        Object.assign(pane.style, { left: `${g.x - g.w / 2}px`, top: `${g.y - g.h / 2}px`, width: `${g.w}px`, height: `${g.h}px` });
    }
    drawWires();
    drawMinimap();
    const box = stage();
    document.documentElement.style.setProperty('--stage-center', `${box.left + box.width / 2}px`);
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
    if (!phone.matches) {
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
function tick(now) {
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
        }
        apply();
    }
    if (field) {
        for (const pane of field.panes) pane.radius = radius * cam.s;
        field.glass.bevel = Math.max(7, RIM.bevel * cam.s);
        field.glass.refraction = Math.max(9, RIM.refraction * cam.s);
    }
}

if (field) field.onFrame(() => tick(performance.now()));

function loop(now) {
    tick(now);
    frame = flight ? requestAnimationFrame(loop) : null;
}

// Fly to a camera { tx, ty, s }. The point at the middle of the screen travels in a
// straight line while the scale eases between the two; on a long trip the scale dips on the
// way, enough to keep both ends in sight at the halfway mark.
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
    const pull = phone.matches ? 0 : Math.min(2, Math.max(0, middle / fit - 1));
    flight = { start: performance.now(), duration: 720 + 380 * Math.min(1, pull), c0, c1, l0: Math.log(cam.s), l1: Math.log(to.s), pull, to };
    world.classList.add('moving');
    if (!field && !frame) frame = requestAnimationFrame(loop);
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
    nextButton.querySelector('.step-name').textContent = next === 'home' ? 'Back to the start' : panes.get(next).dataset.title;
    stepper.querySelector('.step-count').textContent = index ? `${String(index).padStart(2, '0')} / ${String(SEQUENCE.length - 1).padStart(2, '0')}` : 'Start';
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
    const title = panes.get(id).querySelector('.section-title span');
    if (title && fresh) setTimeout(() => scramble(title), instant ? 0 : 450);
    if (push) history.replaceState(null, '', id === 'home' ? location.pathname : `#${id}`);
}

function overviewCamera() {
    const { minX, minY, maxX, maxY } = bounds();
    const box = stage();
    const s = Math.min((box.width - 40) / (maxX - minX), (box.height - 20) / (maxY - minY));
    return { s, tx: box.left + box.width / 2 - ((minX + maxX) / 2) * s, ty: box.top + box.height / 2 - ((minY + maxY) / 2) * s };
}

function overview(instant = false) {
    if (phone.matches) return;
    flyTo(overviewCamera(), instant);
    mode = 'map';
    document.body.classList.add('map-mode');
    document.body.classList.remove('focus-mode');
    for (const pane of panes.values()) pane.classList.remove('focused');
    mark('overview');
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

// A long pane fades at its foot while there is more of it below
for (const body of document.querySelectorAll('.pane-body')) {
    const more = () => body.classList.toggle('more', body.scrollTop + body.clientHeight < body.scrollHeight - 4);
    body.addEventListener('scroll', more, { passive: true });
    new ResizeObserver(more).observe(body);
}

// ---------- Input ----------

// The browser scrolls a box to show a #link's target or a focused link, even one that
// hides its overflow; here only the camera moves
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

// Drag to pan; a press that doesn't move picks the pane under it. On phones the row
// follows the finger and lets go onto the next or previous pane, or back.
let drag = null;
viewport.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.target.closest('a, button, input, .home-rings')) return;
    drag = { x: event.clientX, y: event.clientY, tx: cam.tx, ty: cam.ty, moved: false, target: event.target, mouse: event.pointerType === 'mouse' };
});
window.addEventListener('pointermove', event => {
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
    if (!phone.matches) cam.ty = drag.ty + dy;
    apply();
});
function release(event, cancelled) {
    if (!drag) return;
    const { moved, target, x, y } = drag;
    drag = null;
    viewport.classList.remove('dragging');
    world.classList.remove('moving');
    if (phone.matches) {
        if (!moved) return;
        const dx = event.clientX - x;
        if (!cancelled && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(event.clientY - y)) step(dx < 0 ? 1 : -1);
        else focus(current, { push: false });
        return;
    }
    if (moved || cancelled) return;
    const pane = target.closest('.pane');
    if (pane && (mode === 'map' || !pane.classList.contains('focused'))) {
        interacted();
        focus(pane.id);
    }
}
window.addEventListener('pointerup', event => release(event, false));
window.addEventListener('pointercancel', event => release(event, true));

// The wheel reads the pane in view; a fresh turn of it at the pane's end, or anywhere off
// the pane, steps to the next or previous one. In the overview it zooms; with Ctrl (or a
// pinch) it zooms anywhere.
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
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
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
    if (event.target.closest('input, textarea') || event.metaKey || event.ctrlKey || event.altKey) return;
    const moves = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const inPane = event.target.closest('.pane-body');
    if (moves[event.key] && !inPane) {
        event.preventDefault();
        interacted();
        if (mode === 'map') focus(current);
        else if (phone.matches) step(event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1);
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

window.addEventListener('resize', () => {
    layout();
    if (mode === 'map') overview(true);
    else focus(current, { instant: true, push: false });
});
window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (panes.has(id)) focus(id);
});

// ---------- Start ----------

layout();
const start = location.hash.slice(1);
if (panes.has(start) || !deferField || phone.matches) {
    focus(panes.has(start) ? start : 'home', { instant: true, push: false });
} else {
    // First the whole map, so the layout is clear at a glance; then into Ali's pane
    overview(true);
    intro = setTimeout(() => focus('home', { push: false }), 1100);
}
scramble(document.querySelector('.home-name'), undefined, 900);
