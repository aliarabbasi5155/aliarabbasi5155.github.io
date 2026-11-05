// Lab only: Ali's photo, alive (lab/canvas.js). The photo itself is warped in a small WebGL
// shader, around points placed by hand on his face (in the photo's own pixels): the eyelids
// close for a blink every few seconds, the eyes glance about and toward the pointer, the head
// drifts and tilts a little and the shoulders rise and fall with breathing; and the nearer
// the pointer comes, the wider he smiles (mouth corners out and up, cheeks up, eyes narrowing).
// On a phone, a tap makes him smile, and now and then he smiles on his own.
//
// Light by design: no model, just the one photo already on the page and a shader that moves
// its pixels; it draws at most 30 times a second, and only while the photo is on screen. With
// reduced motion, or without WebGL, the photo stays as it is.
//
//   const photo = livePhoto(img, { reduceMotion });
//   photo.pose({ smile: 1, blink: [1, 1] });   // holds a face, to look at closely; pose() lets go

// Where things are on his face, in the photo's pixels (963 × 825)
const FACE = {
    size: [963, 825],
    centre: [488, 335],
    neck: [488, 540],
    eyes: [
        { centre: [447, 308], half: 25, top: 301, bottom: 315, iris: [448, 308] },
        { centre: [529, 313], half: 24, top: 305, bottom: 321, iris: [528, 313] },
    ],
    mouth: { left: [441, 394], right: [526, 400], upper: [487, 396], lower: [489, 413] },
    cheeks: [[431, 364], [538, 368]],
};

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
uniform sampler2D uImage;
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

// One eye closing: the lid comes down over the eye, most in the middle. Only the lid's own
// skin, the thin band above the lashes, stretches down over it (the brow stays where it is),
// the lash line rides down at its edge, and what is left of the eye is pressed toward the
// lower lid
vec2 blink(vec2 p, vec2 c, float halfWidth, float top, float bottom, float b) {
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

void main() {
    vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uSize;
    vec2 d = vec2(0.0);

    // The head: a little drift and tilt about the neck, fading out away from it
    float head = bump(p, vec2(${FACE.centre}), vec2(175.0, 215.0));
    vec2 rel = p - vec2(${FACE.neck});
    vec2 turned = vec2(cos(uTilt) * rel.x - sin(uTilt) * rel.y, sin(uTilt) * rel.x + cos(uTilt) * rel.y);
    d += head * (uHead + turned - rel);

    // Breathing: the shoulders rise and fall
    d.y -= uBreath * 1.6 * smoothstep(470.0, 600.0, p.y);

    // The smile: corners out and up, lips parting a touch, cheeks up, lower lids up
    float smile = uSmile;
    float wide = max(smile, 0.0);
    d += bump(p, vec2(${FACE.mouth.left}), vec2(18.0, 13.0)) * vec2(-4.2, -5.6) * smile;
    d += bump(p, vec2(${FACE.mouth.right}), vec2(18.0, 13.0)) * vec2(4.2, -5.6) * smile;
    d += bump(p, vec2(${FACE.mouth.upper}), vec2(26.0, 7.0)) * vec2(0.0, -1.4) * smile;
    d += bump(p, vec2(${FACE.mouth.lower}), vec2(28.0, 9.0)) * vec2(0.0, 1.9) * wide;
    d += bump(p, vec2(${FACE.cheeks[0]}), vec2(27.0, 23.0)) * vec2(0.0, -3.3) * smile;
    d += bump(p, vec2(${FACE.cheeks[1]}), vec2(27.0, 23.0)) * vec2(0.0, -3.3) * smile;
    d += bump(p, vec2(${FACE.eyes[0].centre[0]}.0, ${FACE.eyes[0].bottom}.0), vec2(19.0, 5.5)) * vec2(0.0, -1.8) * wide;
    d += bump(p, vec2(${FACE.eyes[1].centre[0]}.0, ${FACE.eyes[1].bottom}.0), vec2(19.0, 5.5)) * vec2(0.0, -1.8) * wide;

    // The eyes glance
    d += (bump(p, vec2(${FACE.eyes[0].iris}), vec2(7.0, 5.5)) + bump(p, vec2(${FACE.eyes[1].iris}), vec2(7.0, 5.5))) * uGaze;

    vec2 src = p - d;
    src = blink(src, vec2(${FACE.eyes[0].centre}), ${FACE.eyes[0].half}.0, ${FACE.eyes[0].top}.0, ${FACE.eyes[0].bottom}.0, uBlink.x);
    src = blink(src, vec2(${FACE.eyes[1].centre}), ${FACE.eyes[1].half}.0, ${FACE.eyes[1].top}.0, ${FACE.eyes[1].bottom}.0, uBlink.y);
    gl_FragColor = texture2D(uImage, clamp(src / uSize, 0.0, 1.0));
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

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Where the face is: the springs move these toward their targets every frame
    const now = performance.now() / 1000;
    const face = {
        smile: { p: -0.3, v: 0, target: -0.3 },
        gx: { p: 0, v: 0, target: 0 },
        gy: { p: 0, v: 0, target: 0 },
        hx: { p: 0, v: 0, target: 0 },
        hy: { p: 0, v: 0, target: 0 },
        blink: [0, 0],
        nextBlink: now + 1.5,
        blinking: null,
        nextGlance: now + 1,
        nextMood: now + 6,
        mood: 0,
        happyUntil: 0,
    };
    const pointer = { x: 0, y: 0, active: false };
    let frame = 0;
    let last = 0;
    let shown = false;
    let held = null;

    const ready = () => {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        img.after(canvas);
        start();
    };
    if (img.complete && img.naturalWidth) ready();
    else img.addEventListener('load', ready, { once: true });

    addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse') return;
        Object.assign(pointer, { x: event.clientX, y: event.clientY, active: true });
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; });
    // A tap on the photo, on a phone: a big smile and a blink
    img.parentElement.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse') return;
        face.happyUntil = performance.now() / 1000 + 2.2;
        face.nextBlink = performance.now() / 1000 + 0.15;
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
            near = smoothstep(reach * 1.6, reach * 0.25, distance);
            const look = Math.min(1, distance / 260);
            face.gx.target = (dx / (distance || 1)) * 2.1 * look;
            face.gy.target = (dy / (distance || 1)) * 1.1 * look;
            face.hx.target = Math.max(-3, Math.min(3, dx / scale / 160));
            face.hy.target = Math.max(-2, Math.min(2, dy / scale / 220));
        } else {
            face.hx.target = Math.sin(t * 0.37) * 1.4;
            face.hy.target = Math.sin(t * 0.29 + 1) * 0.8;
            // Glances: now here, now there, mostly at you
            if (t > face.nextGlance) {
                const away = Math.random() < 0.45;
                face.gx.target = away ? (Math.random() * 2 - 1) * 1.8 : 0;
                face.gy.target = away ? (Math.random() * 2 - 1) * 0.8 : 0;
                face.nextGlance = t + 1.2 + Math.random() * 2.8;
            }
            // Now and then a smile of his own
            if (t > face.nextMood) {
                face.mood = face.mood ? 0 : 0.55 + Math.random() * 0.35;
                face.nextMood = t + (face.mood ? 1.6 + Math.random() * 1.6 : 5 + Math.random() * 6);
            }
            near = face.mood;
        }
        if (t < face.happyUntil) near = 1;
        face.smile.target = -0.3 + 1.3 * near;

        spring(face.smile, dt, 40, 0.9);
        for (const key of ['gx', 'gy']) spring(face[key], dt, 220, 0.8);
        for (const key of ['hx', 'hy']) spring(face[key], dt, 18, 0.9);

        // A blink: quick down, a breath closed, a little slower up; sometimes two
        if (!face.blinking && t > face.nextBlink) {
            face.blinking = t;
            face.nextBlink = t + (Math.random() < 0.15 ? 0.32 : 2.4 + Math.random() * 3.8);
        }
        if (face.blinking) {
            const s = t - face.blinking;
            const b = s < 0.07 ? s / 0.07 : s < 0.11 ? 1 : s < 0.22 ? 1 - (s - 0.11) / 0.11 : 0;
            face.blink = [b, Math.max(0, b - 0.04)];
            if (s >= 0.22) face.blinking = null;
        }
        return box;
    }

    function draw(now) {
        frame = requestAnimationFrame(draw);
        // At most 30 frames a second
        if (now - last < 32) return;
        const dt = Math.min(0.05, (now - last) / 1000 || 1 / 30);
        last = now;
        const t = now / 1000;
        const box = update(t, dt);
        if (held) Object.assign(face, { blink: held.blink ?? face.blink }, held.smile === undefined ? {} : { smile: { ...face.smile, p: held.smile } });
        // Only while it can be seen
        const visible = box.width > 40 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
        if (!visible) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uniforms.blink, ...face.blink);
        gl.uniform1f(uniforms.smile, face.smile.p);
        gl.uniform2f(uniforms.head, face.hx.p, face.hy.p);
        gl.uniform1f(uniforms.tilt, (face.hx.p / 3) * 0.012 + Math.sin(t * 0.21) * 0.004);
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
