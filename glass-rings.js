// Glass rings: a stack of clear glass discs with coral liquid pooled at their lower left,
// floating as one piece. Where the liquid thins out the glass turns milky, then clear.
// The rims catch a light that turns toward the pointer, and in Chromium every disc bends
// what lies behind it at its edge, like real glass. The discs never slide over each other
// and cast no shadows. Used by the page's opening scene (script.js).
//
// The stack answers the mouse: it leans toward the pointer, its front discs more than its
// back ones, as if it turned to face it, and opens out while the pointer is over it. A
// press squeezes it; held, it can be pulled about, and let go it springs back and rings.
// The liquid leans toward the pointer and rocks with every move.
//
//   const rings = new GlassRings(element, { float: 0.6 });
//   rings.start();
//
// The element sets the size (its width); glass-rings.css holds the material. Anything
// already inside the element is placed on the front disc and moves with it; presses on
// links and buttons there stay theirs.

const TAU = Math.PI * 2;

// Back to front: diameter and resting offset from the stack's centre (fractions of the
// largest disc), then where the liquid gathers (sx, sy) and how far it reaches before it
// thins (s1), is half gone (s2) and is gone (s3), in percent of the disc
const DISCS = [
    { d: 1, x: -0.014, y: 0.042, sx: 9, sy: 91, s1: 6, s2: 21, s3: 38 },
    { d: 0.83, x: -0.006, y: 0.02, sx: 11, sy: 89, s1: 10, s2: 32, s3: 55 },
    { d: 0.68, x: 0.002, y: -0.004, sx: 13, sy: 87, s1: 18, s2: 48, s3: 72 },
    { d: 0.52, x: 0.01, y: -0.028, sx: 16, sy: 84, s1: 38, s2: 76, s3: 98 },
    { d: 0.35, x: 0.017, y: -0.05, sx: 22, sy: 78, s1: 46, s2: 120, s3: 140 },
];

// Where the light sits when the pointer is away: upper left, in degrees clockwise from up
const REST_LIGHT = -45;

// How the stack answers the pointer, in fractions of the largest disc: how far the whole
// stack leans toward it and how much farther the front disc goes, at rest and when the
// pointer is over the stack; how far a pull can take it; and how far a disc may stray from
// the one behind it, which keeps every rim clear of its neighbours
const LEAN = [0.015, 0.03];
const FACE = [0.05, 0.09];
const PULL = 0.2;
const STRAY = 0.035;

// Airbrush: where the liquid thins out it breaks into grain instead of fading smoothly.
// The paint's opacity a and a noise n (about 0.3 to 0.7) give a mask 6a + 2.4n - 4.2:
// solid stays solid, bare glass stays bare, and the band where a is about 0.25 to 0.6 is
// stippled. Each disc's paint is drawn once as an image; as a filter on the page the noise
// would be worked out every frame.
const AIRBRUSH = `
    <filter id="a" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="grain"/>
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="noise"/>
        <feComposite in="SourceAlpha" in2="noise" operator="arithmetic" k1="0" k2="6" k3="2.4" k4="-4.2" result="stipple"/>
        <feComposite in="SourceGraphic" in2="stipple" operator="in"/>
    </filter>`;

const SVG_NS = 'http://www.w3.org/2000/svg';
let instances = 0;

// The deep shade the liquid gathers into where it is thickest: darker, a little less grey,
// its hue turned a few degrees (the coral turns red)
export function deepen(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    let h = 0;
    if (d) h = max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const hue = (h * 60 - 6 + 720) % 360;
    const sat = Math.min(1, s * 0.82);
    const light = l * 0.83;
    const a = sat * Math.min(light, 1 - light);
    const channel = n => {
        const k = (n + hue / 30) % 12;
        return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return `#${[0, 8, 4].map(n => Math.round(channel(n) * 255).toString(16).padStart(2, '0')).join('')}`;
}

// One disc's liquid, as an SVG image at its size in CSS pixels: the deep shade where it
// pooled, then the paint colour, airbrushed where it thins out, over a smooth milky haze
function liquid(spec, size, paint, deep) {
    const [sx, sy, s1, s2, s3] = [spec.sx, spec.sy, spec.s1, spec.s2, spec.s3].map(v => v / 100);
    const far = Math.max(1, s3);
    // A circle reaching the farthest corner, as CSS would draw it
    const reach = Math.hypot(Math.max(sx, 1 - sx), Math.max(sy, 1 - sy)) * far * size;
    const at = `gradientUnits="userSpaceOnUse" cx="${sx * size}" cy="${sy * size}" r="${reach}"`;
    const svg = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${size} ${size}">
        <radialGradient id="g" ${at}>
            <stop offset="0" stop-color="${deep}"/>
            <stop offset="${s1 / far}" stop-color="${paint}"/>
            <stop offset="${s2 / far}" stop-color="${paint}" stop-opacity="0.4"/>
            <stop offset="${s3 / far}" stop-color="${paint}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="h" ${at}>
            <stop offset="${s1 / far}" stop-color="#fff" stop-opacity="0"/>
            <stop offset="${s2 / far}" stop-color="#fff" stop-opacity="0.1"/>
            <stop offset="${s3 / far}" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>${AIRBRUSH}
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#h)"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#g)" filter="url(#a)"/>
    </svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// How a disc's rounded edge bends the view, as a displacement map: nothing over the flat
// middle, then a bevel that pulls the view in harder toward the rim, never so hard that it
// folds over itself. Red and green carry the x and y shift (128 is none), with a neutral
// margin so the map still covers the disc if it is scaled. Blue marks the bevel: only
// there is the bent view used, softened a little, since Chromium samples it without
// smoothing and small details would come out jagged.
function bevelMap(size, margin, bevel) {
    const full = size + margin * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = full;
    const context = canvas.getContext('2d');
    const image = context.createImageData(full, full);
    const radius = size / 2;
    const start = 1 - bevel / radius;
    for (let py = 0; py < full; py++) {
        for (let px = 0; px < full; px++) {
            const dx = (px + 0.5 - full / 2) / radius;
            const dy = (py + 0.5 - full / 2) / radius;
            const r = Math.hypot(dx, dy);
            let ox = 0;
            let oy = 0;
            let bevelled = 0;
            if (r < 1 && r > start) {
                const t = (r - start) / (1 - start);
                ox = -dx / r * t * t;
                oy = -dy / r * t * t;
                // Eased in over the bevel's first pixels so the seam does not show
                bevelled = Math.min(1, (r - start) * radius / 2);
            }
            const i = (py * full + px) * 4;
            image.data[i] = 128 + ox * 127;
            image.data[i + 1] = 128 + oy * 127;
            image.data[i + 2] = bevelled * 255;
            image.data[i + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL();
}

// Moves a damped spring { p, v } toward a target: stiffness k, damping ratio z. Short
// substeps keep the stiffest springs steady at any frame rate.
function spring(s, target, k, z, dt) {
    const steps = Math.ceil(dt * 240);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
        s.v += (k * (target - s.p) - 2 * z * Math.sqrt(k) * s.v) * h;
        s.p += s.v * h;
    }
}

// Shortens a shift that strays past half a limit, easing it so it never reaches the limit
function rein(x, y, limit) {
    const length = Math.hypot(x, y);
    const half = limit / 2;
    if (length <= half) return [x, y];
    const k = (half + half * Math.tanh((length - half) / half)) / length;
    return [x * k, y * k];
}

export class GlassRings {
    constructor(element, { float = 0.6, followPointer = true, grab = true, reduceMotion } = {}) {
        this.element = element;
        this.float = float;
        this.reduceMotion = reduceMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.id = `gr${++instances}`;
        this.size = 0;
        this.running = false;
        this.frameId = 0;
        this.last = 0;
        this.written = new WeakMap();
        // Light: the angle the glints face and where it is heading
        this.light = { angle: REST_LIGHT, target: REST_LIGHT, active: false };
        this.refracts = CSS.supports('backdrop-filter', 'url(#a)');
        // The mouse, while it is on the page; how far the stack has opened out toward it;
        // and the press holding the stack, if any
        this.pointer = { x: 0, y: 0, active: false };
        this.open = 0;
        this.held = null;
        // Reduced motion keeps only the light
        this.moves = !this.reduceMotion;

        element.classList.add('glass-rings');
        this.content = [...element.childNodes];
        this.stack = document.createElement('span');
        this.stack.className = 'gr-stack';
        this.stack.innerHTML = '<span class="gr-bloom"></span>';
        this.bloom = this.stack.firstChild;
        this.discs = DISCS.map((spec, i) => {
            const disc = document.createElement('span');
            disc.className = 'gr-disc';
            disc.style.setProperty('--d', spec.d);
            disc.style.setProperty('--x0', spec.x);
            disc.style.setProperty('--y0', spec.y);
            disc.innerHTML = '<span class="gr-paint"></span><span class="gr-glint"></span>';
            this.stack.append(disc);
            return {
                ...spec,
                disc,
                paint: disc.querySelector('.gr-paint'),
                glint: disc.querySelector('.gr-glint'),
                // Each disc's liquid sways on its own rhythm
                period: 6.2 + i * 0.75,
                phase: i * 1.37,
                // Springs: the disc's shift and size, and how far its liquid has rocked
                ox: { p: 0, v: 0 },
                oy: { p: 0, v: 0 },
                scale: { p: 1, v: 0 },
                slosh: { p: 0, v: 0 },
                // When a press's ripple reaches it
                kick: Infinity,
            };
        });
        this.discs.at(-1).disc.append(...this.content);
        element.append(this.stack);

        this.defs = document.createElementNS(SVG_NS, 'svg');
        this.defs.setAttribute('width', '0');
        this.defs.setAttribute('height', '0');
        this.defs.setAttribute('aria-hidden', 'true');
        this.defs.style.position = 'absolute';
        document.body.append(this.defs);

        this.paintColor = getComputedStyle(element).getPropertyValue('--gr-paint').trim() || '#f6654a';
        this.resizeObserver = new ResizeObserver(() => this.measure());
        this.resizeObserver.observe(element);
        this.measure();

        if (followPointer) {
            this.onPointer = event => {
                if (event.pointerType !== 'mouse') return;
                this.lightToward(event.clientX, event.clientY);
                Object.assign(this.pointer, { x: event.clientX, y: event.clientY, active: true });
            };
            this.onLeave = () => this.restLight();
            addEventListener('pointermove', this.onPointer, { passive: true });
            document.documentElement.addEventListener('pointerleave', this.onLeave);
        }
        // A press on the discs is the stack's. The mouse holds on and can pull; a touch
        // only squeezes it, so it can still scroll the page or tap through to it.
        this.grabs = grab && this.moves;
        if (this.grabs) {
            element.classList.add('gr-grab');
            this.stack.addEventListener('pointerdown', this.onPress);
            this.stack.addEventListener('pointermove', this.onPull);
            for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
                this.stack.addEventListener(type, this.onRelease);
            }
        }
        // A hidden tab pauses the stack; stop() keeps it stopped
        this.onVisibility = () => (document.hidden ? this.pause() : this.resume());
        document.addEventListener('visibilitychange', this.onVisibility);
    }

    // Turn the light toward a point on screen
    lightToward(clientX, clientY) {
        const r = this.element.getBoundingClientRect();
        const dx = clientX - (r.left + r.width / 2);
        const dy = clientY - (r.top + r.height / 2);
        if (!dx && !dy) return;
        this.light.target = Math.atan2(dx, -dy) * 180 / Math.PI;
        this.light.active = true;
    }

    restLight() {
        this.light.active = false;
        this.pointer.active = false;
    }

    onPress = event => {
        if (this.held || !event.isPrimary || event.button || event.target.closest('a, button')) return;
        this.lightToward(event.clientX, event.clientY);
        const mouse = event.pointerType === 'mouse';
        this.held = { id: event.pointerId, mouse, x: event.clientX, y: event.clientY, dx: 0, dy: 0, pulled: false };
        if (!mouse) return;
        // No text selection while pulling, and the pull goes on outside the stack
        event.preventDefault();
        event.target.setPointerCapture(event.pointerId);
        document.documentElement.classList.add('gr-grabbing');
    };

    onPull = event => {
        const held = this.held;
        if (!held?.mouse || event.pointerId !== held.id) return;
        held.dx = event.clientX - held.x;
        held.dy = event.clientY - held.y;
        held.pulled ||= Math.hypot(held.dx, held.dy) > 4;
    };

    onRelease = event => {
        const held = this.held;
        if (!held || event.pointerId !== held.id) return;
        this.held = null;
        document.documentElement.classList.remove('gr-grabbing');
        // A cancelled touch became a scroll
        if (event.type !== 'pointerup') return;
        if (!held.pulled) this.poke();
        if (!held.mouse) return;
        // The click that ends a mouse press is the stack's too, wherever it lands
        const swallow = click => click.stopPropagation();
        addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', swallow, { capture: true }));
    };

    // A ripple from the front disc to the back one, and the liquid set rocking
    poke() {
        const now = performance.now() / 1000;
        for (const [i, disc] of this.discs.entries()) {
            disc.kick = now + (this.discs.length - 1 - i) * 0.06;
            disc.slosh.v += (i % 2 ? -1 : 1) * (50 + i * 15);
        }
    }

    setFloat(value) {
        this.float = value;
    }

    setPaint(hex) {
        this.paintColor = hex;
        this.element.style.setProperty('--gr-paint', hex);
        this.paintDiscs();
    }

    measure() {
        const size = Math.round(this.element.clientWidth);
        if (!size || size === this.size) return;
        this.size = size;
        this.element.style.setProperty('--D', `${size}px`);
        this.paintDiscs();
        if (this.refracts) this.bevelDiscs();
    }

    paintDiscs() {
        const deep = deepen(this.paintColor);
        for (const disc of this.discs) {
            disc.paint.style.backgroundImage = liquid(disc, Math.max(1, Math.round(disc.d * this.size)), this.paintColor, deep);
        }
    }

    // One refraction filter per disc, at its current size
    bevelDiscs() {
        this.defs.replaceChildren();
        for (const [i, disc] of this.discs.entries()) {
            const size = Math.max(2, Math.round(disc.d * this.size));
            const bevel = Math.min(16, Math.max(5, size * 0.028));
            const margin = Math.round(size * 0.06);
            const id = `${this.id}-${i}`;
            const box = `x="${-margin}" y="${-margin}" width="${size + margin * 2}" height="${size + margin * 2}"`;
            this.defs.insertAdjacentHTML('beforeend', `
                <filter id="${id}" ${box} filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feImage href="${bevelMap(size, margin, bevel)}" ${box} preserveAspectRatio="none" result="map"/>
                    <feDisplacementMap in="SourceGraphic" in2="map" scale="${(bevel * 0.9).toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/>
                    <feGaussianBlur stdDeviation="0.6" result="bent"/>
                    <feColorMatrix in="map" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="bevel"/>
                    <feComposite in="bent" in2="bevel" operator="in" result="rim"/>
                    <feComposite in="SourceGraphic" in2="bevel" operator="out" result="flat"/>
                    <feMerge><feMergeNode in="flat"/><feMergeNode in="rim"/></feMerge>
                </filter>`);
            disc.disc.style.backdropFilter = `url(#${id})`;
        }
    }

    // Writes a style only when it changes, so a still stack does no work
    put(element, property, value) {
        let last = this.written.get(element);
        if (!last) this.written.set(element, last = {});
        if (last[property] === value) return;
        last[property] = value;
        element.style.setProperty(property, value);
    }

    start() {
        this.running = true;
        this.resume();
    }

    stop() {
        this.running = false;
        this.pause();
    }

    resume() {
        if (!this.running || this.frameId || document.hidden) return;
        this.last = 0;
        this.frameId = requestAnimationFrame(this.frame);
    }

    pause() {
        cancelAnimationFrame(this.frameId);
        this.frameId = 0;
    }

    destroy() {
        this.stop();
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.resizeObserver.disconnect();
        if (this.onPointer) {
            removeEventListener('pointermove', this.onPointer);
            document.documentElement.removeEventListener('pointerleave', this.onLeave);
        }
        document.documentElement.classList.remove('gr-grabbing');
        this.element.classList.remove('gr-grab');
        this.defs.remove();
        this.stack.remove();
        this.element.append(...this.content);
    }

    // Each disc follows the pointer and the press on springs, nearer discs on stiffer ones,
    // so the stack moves like one soft piece; each is then kept clear of the one behind it
    move(t, dt) {
        const D = this.size;
        const box = this.element.getBoundingClientRect();
        const pointer = this.pointer;
        let ux = 0;
        let uy = 0;
        let over = false;
        if (pointer.active) {
            const px = pointer.x - (box.left + box.width / 2);
            const py = pointer.y - (box.top + box.height / 2);
            ux = Math.tanh(px / D);
            uy = Math.tanh(py / D);
            over = Math.hypot(px, py) < D / 2;
        }
        const held = this.held;
        this.open += ((over || held ? 1 : 0) - this.open) * (1 - Math.exp(-dt * 6));
        // A pull gives less the farther it goes
        const reach = D * PULL;
        const gx = held?.mouse ? reach * Math.tanh(held.dx / reach) : 0;
        const gy = held?.mouse ? reach * Math.tanh(held.dy / reach) : 0;
        const lean = D * (LEAN[0] + (LEAN[1] - LEAN[0]) * this.open);
        const face = D * (FACE[0] + (FACE[1] - FACE[0]) * this.open);

        const last = this.discs.length - 1;
        let backX = 0;
        let backY = 0;
        for (const [i, disc] of this.discs.entries()) {
            const depth = i / last;
            const k = 70 + 90 * depth;
            const vx = disc.ox.v;
            spring(disc.ox, gx + ux * (lean + face * depth), k, 0.45, dt);
            spring(disc.oy, gy + uy * (lean + face * depth), k, 0.45, dt);
            if (t >= disc.kick) {
                disc.scale.v += 0.7;
                disc.kick = Infinity;
            }
            // Squeezed while held, the front discs most
            spring(disc.scale, held ? 0.985 - 0.035 * depth : 1, 320, 0.2, dt);
            // The liquid leans toward the pointer and lags behind the disc's moves
            disc.slosh.v += 70 * (disc.ox.v - vx) / D;
            spring(disc.slosh, -ux * 22 * (0.5 + 0.5 * this.open), 20 + 40 * depth, 0.15, dt);

            let x = disc.ox.p;
            let y = disc.oy.p;
            if (i) [x, y] = rein(x - backX, y - backY, D * STRAY).map((d, axis) => d + (axis ? backY : backX));
            [backX, backY] = [x, y];
            this.put(disc.disc, 'transform', `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${disc.scale.p.toFixed(4)})`);
        }
        // The liquid's glow follows the stack and spreads as it opens
        const glow = this.discs[0];
        this.put(this.bloom, 'transform', `translate(${glow.ox.p.toFixed(2)}px, ${glow.oy.p.toFixed(2)}px) scale(${(1 + 0.1 * this.open).toFixed(3)})`);
    }

    frame = now => {
        this.frameId = requestAnimationFrame(this.frame);
        const t = now / 1000;
        const dt = this.last ? Math.min(t - this.last, 1 / 30) : 1 / 60;
        this.last = t;
        const float = this.reduceMotion ? 0 : this.float;
        const D = this.size;
        if (this.moves) this.move(t, dt);

        // The whole stack floats as one piece
        const x = Math.sin(TAU * t / 11 + 1) * D * 0.008 * float;
        const y = Math.sin(TAU * t / 7.5) * D * 0.018 * float;
        this.put(this.stack, 'translate', `${x.toFixed(2)}px ${y.toFixed(2)}px`);

        // The light turns the short way round toward its target; at rest it drifts a little
        const light = this.light;
        const target = light.active ? light.target : REST_LIGHT + Math.sin(t * 0.35) * 16 * (this.reduceMotion ? 0 : 1);
        const turn = ((target - light.angle + 540) % 360) - 180;
        light.angle += turn * (this.reduceMotion ? 1 : 1 - Math.exp(-dt * 5));
        const glint = `${light.angle.toFixed(1)}deg`;

        for (const disc of this.discs) {
            // The liquid sways a little as the stack floats; the light stays where it is
            const sway = Math.sin(TAU * t / disc.period + disc.phase) * 5 * float + disc.slosh.p;
            this.put(disc.paint, 'rotate', `${sway.toFixed(2)}deg`);
            this.put(disc.glint, 'rotate', glint);
        }
    };
}
