// Ali's photo, alive (script.js): it only moves the way a person sitting for a portrait
// does. The head drifts and tilts a little about the neck, and the shoulders rise and fall
// with each breath. The face itself never changes: no blink, no smile, nothing follows the
// pointer. A small WebGL shader moves the photo's own pixels around points placed by hand on
// it (in its pixels, 963 × 825).
//
// Light by design: one photo and a shader; it draws at most 30 times a second, and only
// while the photo is on screen. With reduced motion, or without WebGL, the photo stays still.

const PHOTO = {
    size: [963, 825],
    // The middle of the head, how far around it moves with it, and the neck it turns about
    head: [488, 335],
    reach: [175, 215],
    neck: [488, 540],
    // Where the shoulders begin and end their rise with each breath (rows of the photo)
    shoulders: [470, 600],
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
uniform vec2 uSize;
uniform vec2 uHead;
uniform float uTilt;
uniform float uBreath;
varying vec2 vUv;

float bump(vec2 p, vec2 c, vec2 r) {
    vec2 q = (p - c) / r;
    return exp(-dot(q, q));
}

void main() {
    vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uSize;
    // The head drifts and tilts about the neck, the most at its middle, fading out around it
    vec2 rel = p - ${v(PHOTO.neck)};
    vec2 turned = vec2(cos(uTilt) * rel.x - sin(uTilt) * rel.y, sin(uTilt) * rel.x + cos(uTilt) * rel.y);
    vec2 q = p - bump(p, ${v(PHOTO.head)}, ${v(PHOTO.reach)}) * (uHead + turned - rel);
    // The shoulders rise and fall
    q.y += uBreath * 2.2 * smoothstep(${PHOTO.shoulders[0].toFixed(1)}, ${PHOTO.shoulders[1].toFixed(1)}, p.y);
    gl_FragColor = vec4(texture2D(uPhoto, clamp(q / uSize, 0.0, 1.0)).rgb, 1.0);
}`;

export function livePhoto(img, { reduceMotion = false } = {}) {
    if (reduceMotion || !img) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'live-photo';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = PHOTO.size[0];
    canvas.height = PHOTO.size[1];
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
    const uniforms = { head: u('uHead'), tilt: u('uTilt'), breath: u('uBreath') };
    gl.uniform2f(u('uSize'), ...PHOTO.size);
    gl.uniform1i(u('uPhoto'), 0);

    let frame = 0;
    let last = 0;
    let shown = false;
    // Each visit starts somewhere else in the drift, so it never looks like a loop
    const phase = Math.random() * 100;

    const loaded = img.complete && img.naturalWidth ? Promise.resolve() : new Promise((resolve, reject) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', reject, { once: true });
    });
    loaded.then(() => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        img.after(canvas);
        start();
    }, () => console.warn('Live photo off: the photo did not load'));
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    function draw(time) {
        frame = requestAnimationFrame(draw);
        // At most 30 frames a second, and only while it can be seen
        if (time - last < 32) return;
        last = time;
        const box = canvas.getBoundingClientRect();
        if (!(box.width > 40 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth)) return;
        const t = time / 1000 + phase;
        // Slow waves of different lengths, so the drift never quite repeats
        const hx = Math.sin(t * 0.37) * 2.6 + Math.sin(t * 0.83) * 0.8;
        const hy = Math.sin(t * 0.29 + 1) * 1.4 + Math.sin(t * 0.61) * 0.4;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uniforms.head, hx, hy);
        gl.uniform1f(uniforms.tilt, (hx / 4) * 0.014 + Math.sin(t * 0.21) * 0.005);
        // A breath every four and a half seconds or so
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

    return { canvas, start, stop };
}
