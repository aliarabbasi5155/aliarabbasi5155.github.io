// Glass rings: a stack of clear glass discs with coral liquid pooled at their lower left,
// floating as one piece. Where the liquid thins out the glass turns milky, then clear.
// The rims catch a light that turns toward the pointer; on request, in Chromium, every
// disc also bends what lies behind it at its edge. The discs never slide over each other
// and cast no shadows. Used by the page's opening scene and by lab/rings.html.
//
//   const rings = new GlassRings(element, { float: 0.6 });
//   rings.start();
//
// The element sets the size (its width); glass-rings.css holds the material. Kept light
// enough to leave the page smooth: the float and the sway are CSS animations, which the
// browser runs off the main thread; the paint is drawn once; the script only works while
// the glints are turning toward the pointer. The bend at the rims (refract) is the costly
// part, a filter on everything behind each disc redone every frame, so it is off unless
// asked for.

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

export class GlassRings {
    constructor(element, { float = 0.6, followPointer = true, refract = false, reduceMotion } = {}) {
        this.element = element;
        this.reduceMotion = reduceMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.id = `gr${++instances}`;
        this.size = 0;
        this.running = false;
        this.frameId = 0;
        this.last = 0;
        // Light: the angle the glints face, and the pointer it turns toward (none: at rest)
        this.light = { angle: REST_LIGHT, shown: null, pointer: null };
        this.refracts = false;

        element.classList.add('glass-rings', 'gr-paused');
        element.classList.toggle('gr-still', this.reduceMotion);
        this.setFloat(float);
        this.stack = document.createElement('span');
        this.stack.className = 'gr-stack';
        this.stack.innerHTML = '<span class="gr-bloom"></span>';
        this.discs = DISCS.map((spec, i) => {
            const disc = document.createElement('span');
            disc.className = 'gr-disc';
            disc.style.setProperty('--d', spec.d);
            disc.style.setProperty('--x0', spec.x);
            disc.style.setProperty('--y0', spec.y);
            disc.innerHTML = '<span class="gr-paint"></span><span class="gr-glint"></span>';
            // Each disc's liquid sways on its own rhythm
            const paint = disc.querySelector('.gr-paint');
            paint.style.animationDuration = `${(3.1 + i * 0.375).toFixed(2)}s`;
            paint.style.animationDelay = `${(-i * 1.37).toFixed(2)}s`;
            this.stack.append(disc);
            return { ...spec, disc, paint, glint: disc.querySelector('.gr-glint') };
        });
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
        this.setRefract(refract);
        this.turnGlints();

        if (followPointer) {
            this.onPointer = event => {
                if (event.pointerType === 'mouse') this.lightToward(event.clientX, event.clientY);
            };
            this.onLeave = () => this.restLight();
            addEventListener('pointermove', this.onPointer, { passive: true });
            document.documentElement.addEventListener('pointerleave', this.onLeave);
        }
    }

    // Turn the light toward a point on screen; the angle is worked out on the next frame
    lightToward(clientX, clientY) {
        this.light.pointer = { x: clientX, y: clientY };
        this.request();
    }

    restLight() {
        this.light.pointer = null;
        this.request();
    }

    // How far the stack floats and the liquid sways, 0 to 1 (glass-rings.css reads it)
    setFloat(value) {
        this.element.style.setProperty('--gr-float', value);
    }

    setPaint(hex) {
        this.paintColor = hex;
        this.element.style.setProperty('--gr-paint', hex);
        this.paintDiscs();
    }

    // The bend at the rims, where the browser can draw it
    setRefract(on) {
        this.refracts = on && CSS.supports('backdrop-filter', 'url(#a)');
        if (this.refracts) {
            this.bevelDiscs();
        } else {
            this.defs.replaceChildren();
            for (const disc of this.discs) disc.disc.style.backdropFilter = '';
        }
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

    // Float and sway run while started; stopping freezes them where they are
    start() {
        this.running = true;
        this.element.classList.remove('gr-paused');
        this.request();
    }

    stop() {
        this.running = false;
        this.element.classList.add('gr-paused');
        cancelAnimationFrame(this.frameId);
        this.frameId = 0;
    }

    destroy() {
        this.stop();
        this.resizeObserver.disconnect();
        if (this.onPointer) {
            removeEventListener('pointermove', this.onPointer);
            document.documentElement.removeEventListener('pointerleave', this.onLeave);
        }
        this.defs.remove();
        this.stack.remove();
    }

    request() {
        if (this.running && !this.frameId) this.frameId = requestAnimationFrame(this.frame);
    }

    // The glints are drawn facing up and turned toward the light, as one transform each
    turnGlints() {
        const angle = Math.round(this.light.angle * 10) / 10;
        if (angle === this.light.shown) return;
        this.light.shown = angle;
        for (const disc of this.discs) disc.glint.style.rotate = `${angle}deg`;
    }

    // Only while the light is turning: it eases the short way round to the pointer (or back
    // to rest), and the loop ends once it is there
    frame = now => {
        this.frameId = 0;
        const dt = this.last ? Math.min((now - this.last) / 1000, 1 / 30) : 1 / 60;
        this.last = now;
        const light = this.light;
        let target = REST_LIGHT;
        if (light.pointer) {
            const r = this.element.getBoundingClientRect();
            const dx = light.pointer.x - (r.left + r.width / 2);
            const dy = light.pointer.y - (r.top + r.height / 2);
            if (dx || dy) target = Math.atan2(dx, -dy) * 180 / Math.PI;
        }
        const turn = ((target - light.angle + 540) % 360) - 180;
        light.angle += this.reduceMotion || Math.abs(turn) < 0.1 ? turn : turn * (1 - Math.exp(-dt * 5));
        this.turnGlints();
        if (Math.abs(turn) >= 0.1) this.request();
        else this.last = 0;
    };
}
