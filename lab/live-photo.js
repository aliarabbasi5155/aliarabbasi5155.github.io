// Lab only: Ali's photo, alive (lab/canvas.js). Two photos of the same moment, aligned pixel for
// pixel: the one on the page (smiling, eyes open) and lab/profile-neutral.jpg (a neutral mouth,
// eyes closed). A small WebGL shader mixes them, region by region, and moves their pixels a
// little, around points placed by hand on his face (in the photo's own pixels):
//
//   blinks   the upper lid starts down over the open eye, then the closed eye takes over
//   smile    at rest the mouth is the neutral one; as the pointer comes nearer it curls into a
//            closed-lip smile, and near it opens into the real smile
//   life     the head drifts and tilts, the shoulders rise and fall with breathing, the eyes
//            glance about and toward the pointer, and now and then he smiles on his own
//
// On a phone, a tap makes him smile. Light by design: no model, two photos and a shader; it
// draws at most 30 times a second, and only while the photo is on screen. With reduced
// motion, or without WebGL, the photo stays as it is.
//
//   const photo = livePhoto(img, { reduceMotion });
//   photo.pose({ smile: 1, blink: [1, 1] });   // holds a face, to look at closely; pose() lets go

// Where things are, in the photos' pixels (963 × 825)
const FACE = {
    size: [963, 825],
    centre: [488, 335],
    neck: [488, 540],
    eyes: [
        { centre: [447, 309], half: 25, top: 301, bottom: 315, iris: [448, 308] },
        { centre: [529, 314], half: 24, top: 305, bottom: 321, iris: [528, 313] },
    ],
    // The mouth's corners, smiling (on the page) and neutral (the other photo)
    smile: { left: [441, 394], right: [526, 400] },
    neutral: { left: [450, 403], right: [519, 408] },
    mouth: [486, 402],
    cheeks: [[431, 366], [538, 370]],
};

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const v = ([x, y]) => `vec2(${x.toFixed(1)}, ${y.toFixed(1)})`;

const FRAGMENT = `
precision highp float;
uniform sampler2D uPhoto;
uniform sampler2D uNeutral;
uniform vec2 uSize;
uniform vec2 uBlink;
uniform float uSmile;
uniform vec2 uHead;
uniform float uTilt;
uniform vec2 uGaze;
uniform float uBreath;
varying vec2 vUv;

float bump(vec2 p, vec2 c, vec2 r) {
    vec2 q = (p - c) / r;
    return exp(-dot(q, q));
}

// 1 inside an oval, fading to 0 over the outer part of it
float oval(vec2 p, vec2 c, vec2 r, float soft) {
    return 1.0 - smoothstep(1.0 - soft, 1.0, length((p - c) / r));
}

// The upper lid coming down over an open eye, most in the middle: only the lid's own skin,
// the thin band above the lashes, stretches over it
vec2 lidDown(vec2 p, vec2 c, float halfWidth, float top, float bottom, float b) {
    float dx = abs(p.x - c.x) / halfWidth;
    if (b <= 0.0 || dx >= 1.0) return p;
    float h = bottom - top;
    float k = b * (1.0 - dx * dx);
    float lid = top + k * h;
    float skin = 0.42 * h;
    float start = top - skin;
    if (p.y < start || p.y > bottom) return p;
    if (p.y < lid) return vec2(p.x, start + (p.y - start) * skin / (lid - start));
    return vec2(p.x, top + (p.y - lid) * h / max(bottom - lid, 0.01));
}

vec3 photo(sampler2D image, vec2 p) {
    return texture2D(image, clamp(p / uSize, 0.0, 1.0)).rgb;
}

void main() {
    vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uSize;

    // The head drifts and tilts about the neck; the shoulders rise and fall
    vec2 rel = p - ${v(FACE.neck)};
    vec2 turned = vec2(cos(uTilt) * rel.x - sin(uTilt) * rel.y, sin(uTilt) * rel.x + cos(uTilt) * rel.y);
    vec2 q = p - bump(p, ${v(FACE.centre)}, vec2(175.0, 215.0)) * (uHead + turned - rel);
    q.y += uBreath * 2.2 * smoothstep(470.0, 600.0, p.y);

    // The smile: the neutral mouth curls (corners out and up, cheeks up) as far as a
    // closed-lip smile, then the real smile fades in over it, the two drawn toward each other
    // while they cross
    float lips = clamp(uSmile / 0.55, 0.0, 1.0);
    float grin = smoothstep(0.5, 0.88, uSmile);
    vec2 dn = bump(q, ${v(FACE.neutral.left)}, vec2(18.0, 13.0)) * (vec2(-4.0, -5.0) * lips + vec2(-5.0, -4.0) * grin)
        + bump(q, ${v(FACE.neutral.right)}, vec2(18.0, 13.0)) * (vec2(4.0, -5.0) * lips + vec2(3.0, -3.0) * grin)
        + (bump(q, ${v(FACE.cheeks[0])}, vec2(28.0, 24.0)) + bump(q, ${v(FACE.cheeks[1])}, vec2(28.0, 24.0))) * vec2(0.0, -3.0) * lips;
    vec2 ds = (bump(q, ${v(FACE.smile.left)}, vec2(18.0, 13.0)) * vec2(5.0, 4.0)
        + bump(q, ${v(FACE.smile.right)}, vec2(18.0, 13.0)) * vec2(-3.0, 3.0)) * (1.0 - grin);

    // The eyes glance (the open ones), and the lids start down for a blink
    vec2 gaze = (bump(q, ${v(FACE.eyes[0].iris)}, vec2(7.0, 5.5)) + bump(q, ${v(FACE.eyes[1].iris)}, vec2(7.0, 5.5))) * uGaze;
    vec2 qs = q - ds - gaze;
    qs = lidDown(qs, ${v(FACE.eyes[0].centre)}, ${FACE.eyes[0].half.toFixed(1)}, ${FACE.eyes[0].top.toFixed(1)}, ${FACE.eyes[0].bottom.toFixed(1)}, uBlink.x * 0.7);
    qs = lidDown(qs, ${v(FACE.eyes[1].centre)}, ${FACE.eyes[1].half.toFixed(1)}, ${FACE.eyes[1].top.toFixed(1)}, ${FACE.eyes[1].bottom.toFixed(1)}, uBlink.y * 0.7);

    vec3 open = photo(uPhoto, qs);
    vec3 color = open;
    float mouth = oval(q, ${v(FACE.mouth)}, vec2(94.0, 56.0), 0.5);
    color = mix(color, mix(photo(uNeutral, q - dn), open, grin), mouth);

    // The closed eyes take over as the blink deepens
    vec3 closed = photo(uNeutral, q);
    color = mix(color, closed, oval(q, ${v(FACE.eyes[0].centre)}, vec2(34.0, 17.0), 0.55) * smoothstep(0.3, 0.9, uBlink.x));
    color = mix(color, closed, oval(q, ${v(FACE.eyes[1].centre)}, vec2(34.0, 17.0), 0.55) * smoothstep(0.3, 0.9, uBlink.y));
    gl_FragColor = vec4(color, 1.0);
}`;

const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

export function livePhoto(img, { reduceMotion = false } = {}) {
    if (reduceMotion) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'live-photo';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = FACE.size[0];
    canvas.height = FACE.size[1];
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return null;

    const shader = (type, source) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    };
    const program = gl.createProgram();
    try {
        gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    } catch (error) {
        console.warn('Live photo off:', error);
        return null;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const u = name => gl.getUniformLocation(program, name);
    const uniforms = { size: u('uSize'), blink: u('uBlink'), smile: u('uSmile'), head: u('uHead'), tilt: u('uTilt'), gaze: u('uGaze'), breath: u('uBreath') };
    gl.uniform2f(uniforms.size, ...FACE.size);
    gl.uniform1i(u('uPhoto'), 0);
    gl.uniform1i(u('uNeutral'), 1);

    const texture = (unit, image) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    };

    // Where the face is: the springs move these toward their targets every frame
    const now = performance.now() / 1000;
    const face = {
        smile: { p: 0, v: 0, target: 0 },
        gx: { p: 0, v: 0, target: 0 },
        gy: { p: 0, v: 0, target: 0 },
        hx: { p: 0, v: 0, target: 0 },
        hy: { p: 0, v: 0, target: 0 },
        blink: [0, 0],
        nextBlink: now + 1.2,
        blinking: null,
        nextGlance: now + 1,
        nextMood: now + 4,
        mood: 0,
        happyUntil: 0,
    };
    const pointer = { x: 0, y: 0, active: false };
    let frame = 0;
    let last = 0;
    let shown = false;
    let held = null;

    // Both photos, then it starts
    const neutral = new Image();
    neutral.decoding = 'async';
    neutral.src = new URL('./profile-neutral.jpg', import.meta.url).href;
    const loaded = image => (image.complete && image.naturalWidth ? Promise.resolve() : new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', reject, { once: true });
    }));
    Promise.all([loaded(img), loaded(neutral)]).then(() => {
        texture(0, img);
        texture(1, neutral);
        img.after(canvas);
        start();
    }, () => console.warn('Live photo off: a photo did not load'));

    addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse') return;
        Object.assign(pointer, { x: event.clientX, y: event.clientY, active: true });
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; });
    // A tap on the photo, on a phone: a big smile
    img.parentElement.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse') return;
        face.happyUntil = performance.now() / 1000 + 2.4;
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    // The face's place on screen, as the canvas shows the photo (cover, 51% 30%)
    function onScreen() {
        const box = canvas.getBoundingClientRect();
        const scale = Math.max(box.width / FACE.size[0], box.height / FACE.size[1]);
        const left = box.left + (box.width - FACE.size[0] * scale) * 0.51;
        const top = box.top + (box.height - FACE.size[1] * scale) * 0.3;
        return { box, scale, x: left + FACE.centre[0] * scale, y: top + FACE.centre[1] * scale };
    }

    function spring(s, dt, k = 60, damping = 0.85) {
        s.v += (k * (s.target - s.p) - 2 * damping * Math.sqrt(k) * s.v) * dt;
        s.p += s.v * dt;
    }

    function update(t, dt) {
        const { box, x, y, scale } = onScreen();
        // The pointer: the nearer, the wider the smile; the eyes and head turn toward it
        let near = 0;
        if (pointer.active) {
            const dx = pointer.x - x;
            const dy = pointer.y - y;
            const distance = Math.hypot(dx, dy);
            const reach = Math.max(box.width, 160);
            near = smoothstep(reach * 1.7, reach * 0.3, distance);
            const look = Math.min(1, distance / 240);
            face.gx.target = (dx / (distance || 1)) * 2.2 * look;
            face.gy.target = (dy / (distance || 1)) * 1.2 * look;
            face.hx.target = Math.max(-4, Math.min(4, dx / scale / 120));
            face.hy.target = Math.max(-2.5, Math.min(2.5, dy / scale / 180));
        } else {
            face.hx.target = Math.sin(t * 0.37) * 2.6 + Math.sin(t * 0.83) * 0.8;
            face.hy.target = Math.sin(t * 0.29 + 1) * 1.4;
            // Glances: now here, now there, mostly at you
            if (t > face.nextGlance) {
                const away = Math.random() < 0.45;
                face.gx.target = away ? (Math.random() * 2 - 1) * 1.9 : 0;
                face.gy.target = away ? (Math.random() * 2 - 1) * 0.9 : 0;
                face.nextGlance = t + 1.2 + Math.random() * 2.8;
            }
        }
        // Now and then a smile of his own: mostly closed-lip, sometimes the real one
        if (t > face.nextMood) {
            face.mood = face.mood ? 0 : Math.random() < 0.3 ? 1 : 0.4 + Math.random() * 0.15;
            face.nextMood = t + (face.mood ? 1.4 + Math.random() * 1.8 : 4 + Math.random() * 6);
        }
        near = Math.max(near, face.mood);
        if (t < face.happyUntil) near = 1;
        face.smile.target = near;

        spring(face.smile, dt, 36, 0.95);
        for (const key of ['gx', 'gy']) spring(face[key], dt, 220, 0.8);
        for (const key of ['hx', 'hy']) spring(face[key], dt, 14, 0.9);

        // A blink: down quickly, a beat closed, up a little slower; sometimes two
        if (!face.blinking && t > face.nextBlink) {
            face.blinking = t;
            face.nextBlink = t + (Math.random() < 0.15 ? 0.36 : 2.2 + Math.random() * 3.6);
        }
        if (face.blinking) {
            const s = t - face.blinking;
            const b = s < 0.09 ? s / 0.09 : s < 0.15 ? 1 : s < 0.28 ? 1 - (s - 0.15) / 0.13 : 0;
            face.blink = [b, Math.max(0, b - 0.05)];
            if (s >= 0.28) face.blinking = null;
        }
        return box;
    }

    function draw(time) {
        frame = requestAnimationFrame(draw);
        // At most 30 frames a second
        if (time - last < 32) return;
        const dt = Math.min(0.05, (time - last) / 1000 || 1 / 30);
        last = time;
        const t = time / 1000;
        const box = update(t, dt);
        if (held) {
            if (held.blink) face.blink = held.blink;
            if (held.smile !== undefined) face.smile.p = held.smile;
        }
        // Only while it can be seen
        if (!(box.width > 40 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth)) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uniforms.blink, ...face.blink);
        gl.uniform1f(uniforms.smile, Math.min(1, Math.max(0, face.smile.p)));
        gl.uniform2f(uniforms.head, face.hx.p, face.hy.p);
        gl.uniform1f(uniforms.tilt, (face.hx.p / 4) * 0.014 + Math.sin(t * 0.21) * 0.005);
        gl.uniform2f(uniforms.gaze, face.gx.p, face.gy.p);
        gl.uniform1f(uniforms.breath, Math.sin(t * Math.PI * 2 / 4.6));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!shown) {
            shown = true;
            canvas.classList.add('on');
        }
    }

    function start() {
        if (!frame && !document.hidden && canvas.isConnected) frame = requestAnimationFrame(draw);
    }

    function stop() {
        cancelAnimationFrame(frame);
        frame = 0;
    }

    return { canvas, start, stop, pose: values => { held = values ?? null; } };
}
