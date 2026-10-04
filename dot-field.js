// Dot field: one persistent cloud of particles that morphs between procedural
// shapes. Particles are drawn additively into an offscreen buffer, then an
// ordered-dither pass turns that buffer into grainy specks, colored by a palette.
//
// A page hands over a list of scenes ({ shape, wide, tall }) and then jumps
// between them with morphTo().

export const SHAPES = ['ring', 'portrait', 'beam', 'rings', 'terrain', 'streams', 'ripples', 'book', 'globe'];

export const PALETTES = {
	// Warm grey grains on charcoal
	sand: {
		background: '#191a1e',
		low: '#b0aca2',
		high: '#b0aca2',
		accent: '#b0aca2',
		accentMix: 0,
		glow: 0,
		glowColor: '#000000',
		gain: 1.35,
		grain: 0.1,
	},
	// Indigo to lavender on black, with a soft violet bloom
	violet: {
		background: '#000000',
		low: '#7c5cf6',
		high: '#e4ddff',
		accent: '#c084fc',
		accentMix: 0.45,
		glow: 0.6,
		glowColor: '#6366f1',
		gain: 1.45,
		grain: 0.05,
	},
};

const FOV = (45 * Math.PI) / 180;
const CAM_Z = 6;
// Below this width / height ratio a scene uses its `tall` placement
const TALL_ASPECT = 0.85;

const PARTICLE_VS = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec4 aSeed;
layout(location = 1) in vec4 aSeed2;
// Portrait sample: xy in image space (height spans -0.5…0.5), z is relief
layout(location = 2) in vec3 aImage;

uniform mat4 uProjView;
// Half extents of the view at z = 0, in world units
uniform vec2 uHalf;
uniform float uAspect;
uniform float uTime;
uniform float uClock;
// Morph from shape A to shape B; 0 is all A, 1 is all B
uniform int uShapeA;
uniform int uShapeB;
uniform float uMorph;
// Placement: xy offset in half-view units, z scale
uniform vec3 uPlaceA;
uniform vec3 uPlaceB;
uniform float uIntro;
uniform float uEnergy;
uniform float uHasImage;
uniform float uPointSize;
// xy pointer in NDC, z how present it is
uniform vec3 uPointer;
// xy origin in NDC, z start clock, w strength
uniform vec4 uRipples[4];

out float vAlpha;

const float PI = 3.14159265;
const float TAU = 6.28318531;

float hash(float n) { return fract(sin(n) * 43758.5453123); }

vec2 gauss(vec2 u) {
	float r = sqrt(-2.0 * log(max(u.x, 1e-4)));
	return r * vec2(cos(TAU * u.y), sin(TAU * u.y));
}

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }

// Ambient specks shared by every shape, so they hold still while the rest morphs
vec4 dust(vec4 s, vec4 r, float t) {
	vec3 p = vec3(
		(s.x * 2.0 - 1.0) * uHalf.x * 1.1,
		(s.y * 2.0 - 1.0) * uHalf.y * 1.1,
		(s.z * 2.0 - 1.0) * 1.2
	);
	p.x += sin(t * 0.07 + r.x * TAU) * 0.18;
	p.y += cos(t * 0.05 + r.y * TAU) * 0.14;
	return vec4(p, 0.22 + 0.3 * r.z);
}

// How much of each shape's budget drifts as dust
float dustShare(int i) {
	if (i == 0) return 0.12;
	if (i == 4) return 0.08;
	if (i == 5) return 0.3;
	if (i == 7) return 0.12;
	if (i == 8) return 0.14;
	return 0.1;
}

vec4 ring(vec4 s, vec4 r, float t) {
	float R = min(uHalf.y * 0.74, uHalf.x * 0.8);
	float a = s.x * TAU + t * 0.025;
	vec2 g = gauss(s.yz);
	float wobble = 0.035 * sin(a * 3.0 + t * 0.5) + 0.025 * sin(a * 5.0 - t * 0.37);
	float thickness = R * (0.07 + 0.045 * (0.5 + 0.5 * sin(a * 2.0 + t * 0.3)));
	float radius = R * (1.0 + wobble + 0.012 * sin(t * 0.9)) + g.x * thickness;
	vec3 p = vec3(cos(a) * radius, sin(a) * radius, g.y * thickness * 1.4);
	p = rotY(0.2 * sin(t * 0.11)) * rotX(0.14 * cos(t * 0.09)) * p;
	return vec4(p, 0.85);
}

// One view-height tall at scale 1
vec4 portrait(vec4 s, vec4 r, float t) {
	vec3 q;
	float alpha;
	if (uHasImage > 0.5) {
		q = vec3(aImage.xy * uHalf.y, aImage.z * uHalf.y * 0.35);
		q.z += 0.05 * sin(aImage.y * 14.0 + t * 0.9);
		q.xy += (r.xy - 0.5) * 0.01;
		// The bust fades out at the bottom edge
		alpha = 0.95 * smoothstep(-0.5, -0.36, aImage.y);
	} else {
		// Until the photo is sampled: a plain sphere
		vec3 dir = normalize(vec3(gauss(s.xy), gauss(s.zw).x) + 1e-4);
		q = dir * uHalf.y * 0.3 * (0.92 + 0.08 * r.x);
		alpha = 0.7;
	}
	q = rotY(0.12 * sin(t * 0.17)) * q;
	return vec4(q, alpha);
}

vec4 beam(vec4 s, vec4 r, float t) {
	// Grains flow left to right, a wide haze narrowing into one bright line
	float u = fract(s.x + t * 0.035);
	float k = smoothstep(0.0, 0.72, u);
	float spread = mix(uHalf.y * 1.2, 0.07, k);
	vec2 g = gauss(s.yz);
	float cy = mix(uHalf.y * 0.35, -uHalf.y * 0.02, k) + 0.04 * sin(u * 14.0 - t * 1.4) * k;
	vec3 p = vec3(
		mix(-uHalf.x * 1.25, uHalf.x * 1.15, u),
		cy + g.x * spread * 0.42,
		g.y * spread * 0.25
	);
	float alpha = mix(0.5, 1.0, k) * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.93, 1.0, u));
	return vec4(p, alpha);
}

vec4 rings(vec4 s, vec4 r, float t) {
	// sqrt biases grains outward, where the rings are longer
	float k = floor(sqrt(s.x) * 7.0);
	float a = s.y * TAU;
	float wave = 0.09 * sin(a * 3.0 + k * 1.7 + t * 0.55)
		+ 0.05 * sin(a * 5.0 - k - t * 0.4)
		+ 0.03 * sin(a * 2.0 + t * 0.8);
	vec2 g = gauss(s.zw);
	float radius = uHalf.y * (0.2 + k * 0.17) * (1.0 + wave) + g.x * uHalf.y * (0.01 + 0.005 * k);
	float alpha = 1.0 - k * 0.07;
	if (r.z < 0.2) {
		// Faint haze between the rings
		radius = uHalf.y * (0.12 + sqrt(s.x) * 1.25) * (1.0 + wave);
		alpha = 0.3;
	}
	vec3 p = vec3(cos(a) * radius * 1.15, sin(a) * radius, g.y * 0.03 + 0.12 * sin(radius * 3.0 - t * 1.2));
	p = rotX(0.45) * rotY(-0.35) * p;
	return vec4(p, alpha);
}

vec4 terrain(vec4 s, vec4 r, float t) {
	float x = (s.x * 2.0 - 1.0) * uHalf.x * 1.15;
	float z = (s.y * 2.0 - 1.0) * 1.3;
	float h = 0.18 * sin(x * 1.1 + t * 0.45 + z * 0.8)
		+ 0.1 * sin(x * 2.3 - t * 0.7 + z * 2.1)
		+ 0.05 * sin(x * 4.1 + t * 1.1 - z * 3.0);
	float peakX = uHalf.x * 0.1 + 0.5 * sin(t * 0.2);
	h += exp(-pow((x - peakX) * 0.9, 2.0)) * (0.45 + 0.15 * sin(t * 0.6)) * (1.0 - abs(z) * 0.45);
	h += gauss(s.zw).x * 0.03;
	vec3 p = rotX(0.3) * vec3(x, h, z);
	float alpha = 0.5 + 0.7 * clamp(h * 1.4, 0.0, 1.0);
	return vec4(p, alpha);
}

vec4 streams(vec4 s, vec4 r, float t) {
	float j = floor(s.x * 9.0);
	float u = fract(s.y + t * (0.012 + 0.01 * hash(j * 1.7 + 0.3)));
	float y = mix(uHalf.y * 1.25, -uHalf.y * 1.25, u);
	float x0 = (hash(j * 3.1 + 0.7) * 2.0 - 1.0) * uHalf.x * 0.95;
	float x = x0 + sin(u * TAU * (0.4 + 0.5 * hash(j * 7.7 + 0.1)) + j * 1.3 + t * 0.15) * uHalf.x * 0.16;
	vec2 g = gauss(s.zw);
	float thickness = 0.015 + 0.13 * pow(0.5 + 0.5 * sin(u * 9.0 + j * 2.0 + t * 0.3), 3.0);
	vec3 p = vec3(x + g.x * thickness, y, g.y * thickness + (hash(j * 5.3 + 0.2) - 0.5) * 2.0);
	float alpha = (0.45 + 0.55 * hash(j * 1.9 + 0.4)) * smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.9, 1.0, u));
	return vec4(p, alpha);
}

vec4 ripples(vec4 s, vec4 r, float t) {
	float count = 11.0;
	float k = floor(s.x * count);
	// Every ring travels outward and is reborn at the center
	float phase = fract(k / count + t * 0.045);
	float a = s.y * TAU;
	float radius = mix(uHalf.y * 0.32, max(uHalf.x * 1.1, uHalf.y * 0.95), phase);
	radius *= 1.0 + 0.03 * sin(a * 4.0 + k * 1.3 + t * 0.7);
	vec2 g = gauss(s.zw);
	radius += g.x * uHalf.y * (0.008 + 0.03 * phase);
	vec3 p = vec3(cos(a) * radius, sin(a) * radius * 0.52, g.y * 0.05);
	float alpha = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.75, 1.0, phase));
	return vec4(p, alpha);
}

// An open book: ragged lines of text on two curved pages, one page turning
vec4 book(vec4 s, vec4 r, float t) {
	float pageWidth = uHalf.y * 0.95;
	float pageHeight = uHalf.y * 1.3;
	vec2 g = gauss(s.zw);
	float side = s.x < 0.5 ? -1.0 : 1.0;
	float u = fract(s.x * 2.0);
	float v = s.y;
	float alpha = 0.95;

	if (r.z < 0.16) {
		// Paper edges: the outer edge and the top and bottom of each page
		if (r.x < 0.4) u = 1.0;
		else v = r.y < 0.5 ? 0.0 : 1.0;
		u += g.x * 0.004;
		alpha = 0.55;
	} else if (r.z < 0.86) {
		// Lines of text, ragged on the right
		float rows = 15.0;
		float row = floor(s.y * rows);
		float lineLength = 0.45 + 0.5 * hash(row * 7.1 + side * 3.3);
		if (hash(row * 2.9 + side) < 0.12) lineLength *= 0.35;
		u = mix(0.1, 0.1 + 0.8 * lineLength, u);
		v = mix(0.08, 0.92, (row + 0.5 + g.x * 0.07) / rows);
	} else {
		// A page sweeping over the spine, right to left
		float turn = smoothstep(0.0, 1.0, fract(t * 0.06 + 0.3));
		float angle = turn * PI;
		float lift = 0.12 * sin(u * PI) * sin(angle);
		vec3 p = vec3(cos(angle) * u * pageWidth, (0.5 - v) * pageHeight, sin(angle) * u * pageWidth * 0.7 + lift + 0.08);
		p = rotX(-0.55) * rotY(0.08 * sin(t * 0.2)) * p;
		return vec4(p, 0.35 * sin(angle + 0.15));
	}

	// Pages bow up from the spine, then flatten out
	float curl = 0.3 * sqrt(u) * (1.0 - 0.55 * u) * uHalf.y * 0.4;
	vec3 p = vec3(side * u * pageWidth, (0.5 - v) * pageHeight, curl + g.y * 0.006);
	p = rotX(-0.55) * rotY(0.08 * sin(t * 0.2)) * p;
	return vec4(p, alpha);
}

// A slowly turning globe: latitude lines, meridians, a faint shell and an orbit
vec4 globe(vec4 s, vec4 r, float t) {
	float R = uHalf.y * 0.62;
	vec2 g = gauss(s.zw);
	vec3 p;
	float alpha;
	if (r.z < 0.5) {
		// Latitudes, picked by area so the poles don't crowd
		float lat = asin(s.x * 2.0 - 1.0);
		lat = (floor(lat / PI * 12.0) + 0.5) / 12.0 * PI;
		float lon = s.y * TAU;
		p = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
		alpha = 0.95;
	} else if (r.z < 0.75) {
		float lon = floor(s.x * 12.0) / 12.0 * TAU;
		float lat = (s.y - 0.5) * PI;
		p = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
		alpha = 0.6;
	} else if (r.z < 0.9) {
		p = normalize(vec3(gauss(s.xy), g.x) + 1e-4);
		alpha = 0.3;
	} else {
		float a = s.x * TAU + t * 0.2;
		p = rotX(1.2) * vec3(cos(a) * 1.45, sin(a) * 1.45, 0.0);
		alpha = 0.7;
		p = rotY(0.4) * p;
		p *= R;
		p.xy += g * 0.012;
		return vec4(p, alpha);
	}
	p = rotX(0.35) * rotY(t * 0.12) * p;
	// Back of the globe sits dimmer
	alpha *= 0.45 + 0.55 * smoothstep(-1.0, 1.0, p.z);
	p = p * R + vec3(g * 0.008, 0.0);
	return vec4(p, alpha);
}

vec4 shapeAt(int i, vec4 s, vec4 r, float t) {
	if (i == 0) return ring(s, r, t);
	if (i == 1) return portrait(s, r, t);
	if (i == 2) return beam(s, r, t);
	if (i == 3) return rings(s, r, t);
	if (i == 4) return terrain(s, r, t);
	if (i == 5) return streams(s, r, t);
	if (i == 6) return ripples(s, r, t);
	if (i == 7) return book(s, r, t);
	return globe(s, r, t);
}

vec4 sceneAt(int i, vec3 place, vec4 s, vec4 r, float t) {
	if (r.w < dustShare(i)) return dust(s, r, t);
	vec4 p = shapeAt(i, s, r, t);
	p.xyz *= place.z;
	p.xy += place.xy * uHalf;
	return p;
}

void main() {
	vec4 s = aSeed;
	vec4 r = aSeed2;
	float t = uTime;

	// Each grain leaves on its own beat, so the swap reads as a dissolve
	float stagger = hash(s.x * 91.7 + r.y * 13.3);
	float local = smoothstep(0.0, 1.0, clamp(uMorph * 1.7 - stagger * 0.7, 0.0, 1.0));

	vec4 shape;
	if (local <= 0.0) shape = sceneAt(uShapeA, uPlaceA, s, r, t);
	else if (local >= 1.0) shape = sceneAt(uShapeB, uPlaceB, s, r, t);
	else shape = mix(sceneAt(uShapeA, uPlaceA, s, r, t), sceneAt(uShapeB, uPlaceB, s, r, t), local);

	// Mid-flight the grains billow out into a loose cloud
	float bump = sin(local * PI);
	vec3 dir = vec3(gauss(r.xy), gauss(vec2(r.z, stagger)).x);
	vec3 pos = shape.xyz + dir * bump * uHalf.y * (0.1 + 0.18 * hash(r.w * 71.3));
	pos.xy += bump * vec2(sin(pos.y * 1.7 + t * 0.6), cos(pos.x * 1.3 - t * 0.5)) * 0.2;

	// Field energy speeds time on the CPU; here it adds a nervous tremor
	pos += vec3(sin(t * 3.1 + stagger * 40.0), cos(t * 2.7 + r.x * 40.0), 0.0) * uEnergy * uEnergy * 0.03;

	// Entrance: grains gather in from a wide cloud
	float intro = smoothstep(0.0, 1.0, clamp(uIntro * 1.6 - stagger * 0.6, 0.0, 1.0));
	vec3 far = vec3(dir.xy * uHalf.x * 0.8, dir.z * 1.2 - 1.5);
	pos = mix(far, pos, intro);

	vec4 clip = uProjView * vec4(pos, 1.0);
	if (clip.w < 0.2) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		gl_PointSize = 0.0;
		vAlpha = 0.0;
		return;
	}

	// Pointer and ripples push in screen space, measured in screen heights
	vec2 ndc = clip.xy / clip.w;
	vec2 toNdc = vec2(1.0 / uAspect, 1.0);
	vec2 d = (ndc - uPointer.xy) * vec2(uAspect, 1.0);
	float dist = length(d) + 1e-4;
	ndc += d / dist * toNdc * uPointer.z * 0.06 * exp(-dist * dist * 24.0);
	for (int k = 0; k < 4; k++) {
		vec4 rp = uRipples[k];
		float age = uClock - rp.z;
		if (age > 0.0 && age < 2.4) {
			vec2 q = (ndc - rp.xy) * vec2(uAspect, 1.0);
			float len = length(q) + 1e-4;
			float band = exp(-pow((len - age * 0.9) * 7.0, 2.0));
			ndc += q / len * toNdc * band * 0.07 * rp.w * (1.0 - age / 2.4);
		}
	}
	gl_Position = vec4(ndc * clip.w, clip.z, clip.w);

	// A few grains are much larger, the specks that catch the eye
	float big = pow(hash(s.y * 37.1 + r.x * 3.7), 10.0);
	float size = uPointSize * mix(0.55, 1.0, r.y) * (1.0 + 2.2 * big) * (${CAM_Z.toFixed(1)} / clip.w);
	gl_PointSize = clamp(size, 1.0, uPointSize * 6.0);
	vAlpha = shape.w * intro * mix(0.5, 1.0, hash(r.x * 17.3 + s.z)) * (1.0 - 0.3 * min(bump, 1.0));
}
`;

const PARTICLE_FS = /* glsl */ `#version 300 es
precision highp float;

in float vAlpha;
out vec4 outColor;

void main() {
	vec2 c = gl_PointCoord - 0.5;
	float r2 = dot(c, c) * 4.0;
	if (r2 > 1.0) discard;
	// Soft halo around a firmer core
	float coverage = exp(-r2 * 3.2) * 0.5 + (1.0 - smoothstep(0.18, 0.62, sqrt(r2))) * 0.5;
	outColor = vec4(vec3(coverage * vAlpha), 1.0);
}
`;

const POST_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
	vUv = aPosition * 0.5 + 0.5;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const POST_FS = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTexture;
uniform float uPixelRatio;
uniform float uTime;
// Dither cell in CSS pixels
uniform float uCell;
uniform float uLevels;
uniform float uGain;
uniform float uGrain;
uniform float uGrainTime;
// 0 shows the raw buffer, 1 the fully dithered one
uniform float uDither;
uniform vec3 uBackground;
// Ink runs from low (sparse grains) to high (dense clusters)
uniform vec3 uInkLow;
uniform vec3 uInkHigh;
// A second hue drifting across the screen
uniform vec3 uAccent;
uniform float uAccentMix;
// Bloom read from the buffer's mip chain; 0 skips it
uniform vec3 uGlowColor;
uniform float uGlow;

float hash21(vec2 v) {
	vec3 p3 = fract(vec3(v.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float bayer4(vec2 cell) {
	const float matrix[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
	ivec2 i = ivec2(mod(cell, 4.0));
	return (matrix[i.x + i.y * 4] + 0.5) / 16.0;
}

void main() {
	float signal = pow(clamp(textureLod(uTexture, vUv, 0.0).r * uGain, 0.0, 1.0), 0.9);

	// A slightly rotated grid keeps the pattern from lining up with the screen
	vec2 css = gl_FragCoord.xy / max(1.0, uPixelRatio);
	float angle = 0.21;
	vec2 grid = floor(mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * css / uCell);
	float threshold = mix(bayer4(grid), hash21(grid), 0.12);
	float dithered = clamp(floor(signal * uLevels + threshold) / uLevels, 0.0, 1.0);
	float coverage = mix(signal, dithered, uDither);

	vec3 ink = mix(uInkLow, uInkHigh, smoothstep(0.15, 0.95, signal));
	float sweep = 0.5 + 0.5 * sin(vUv.x * 3.0 - vUv.y * 2.0 + uTime * 0.25);
	ink = mix(ink, uAccent, sweep * uAccentMix * (1.0 - 0.5 * signal));

	// Faint stepped film grain lifts the empty ground
	float grain = hash21(grid + vec2(uGrainTime * 7.0, uGrainTime * 3.0));
	vec3 ground = mix(uBackground, uInkLow, grain * grain * uGrain);
	vec3 color = mix(ground, ink, coverage);

	if (uGlow > 0.0) {
		float halo = textureLod(uTexture, vUv, 3.0).r * 0.7 + textureLod(uTexture, vUv, 5.0).r * 0.9;
		color += uGlowColor * halo * uGlow;
	}

	vec2 c = vUv - 0.5;
	float vignette = 1.0 - dot(c, c) * 0.3;
	outColor = vec4(color * vignette, 1.0);
}
`;

function compile(gl, type, source) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
	}
	return shader;
}

function createProgram(gl, vertex, fragment) {
	const program = gl.createProgram();
	gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
	gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
	}
	const uniforms = {};
	const total = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
	for (let i = 0; i < total; i++) {
		const { name } = gl.getActiveUniform(program, i);
		uniforms[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, name);
	}
	return { program, uniforms };
}

function attribute(gl, location, data, size, usage = gl.STATIC_DRAW) {
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, data, usage);
	gl.enableVertexAttribArray(location);
	gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
	return buffer;
}

function randoms(length) {
	const data = new Float32Array(length);
	for (let i = 0; i < length; i++) data[i] = Math.random();
	return data;
}

function rgb(hex) {
	const value = parseInt(hex.slice(1), 16);
	return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function perspective(fovy, aspect, near, far) {
	const f = 1 / Math.tan(fovy / 2);
	const nf = 1 / (near - far);
	return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function lookAt(eye, target) {
	let zx = eye[0] - target[0];
	let zy = eye[1] - target[1];
	let zz = eye[2] - target[2];
	let length = Math.hypot(zx, zy, zz);
	zx /= length; zy /= length; zz /= length;
	// up = (0, 1, 0)
	let xx = zz;
	let xz = -zx;
	length = Math.hypot(xx, xz);
	xx /= length; xz /= length;
	const yx = zy * xz;
	const yy = zz * xx - zx * xz;
	const yz = -zy * xx;
	return new Float32Array([
		xx, yx, zx, 0,
		0, yy, zy, 0,
		xz, yz, zz, 0,
		-(xx * eye[0] + xz * eye[2]),
		-(yx * eye[0] + yy * eye[1] + yz * eye[2]),
		-(zx * eye[0] + zy * eye[1] + zz * eye[2]),
		1,
	]);
}

function multiply(a, b) {
	const out = new Float32Array(16);
	for (let col = 0; col < 4; col++) {
		for (let row = 0; row < 4; row++) {
			let sum = 0;
			for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
			out[col * 4 + row] = sum;
		}
	}
	return out;
}

export class DotField {
	/**
	 * scenes: [{ shape: 'ring', wide: [x, y, scale], tall?: [x, y, scale] }, …]
	 * x and y are offsets in half-view units (1 reaches the screen edge), scale multiplies the shape.
	 */
	constructor(canvas, {
		scenes,
		initial = 0,
		count = 60000,
		palette = PALETTES.sand,
		dither = true,
		pointSize = 2.9,
		morphDuration = 1.8,
		reduceMotion = false,
		maxPixelRatio = 1.5,
	}) {
		const gl = canvas.getContext('webgl2', {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			powerPreference: 'high-performance',
		});
		if (!gl) throw new Error('WebGL2 is not available');

		this.gl = gl;
		this.canvas = canvas;
		this.count = count;
		this.dither = dither ? 1 : 0;
		this.pointSize = pointSize;
		this.morphDuration = morphDuration;
		this.reduceMotion = reduceMotion;
		this.maxPixelRatio = maxPixelRatio;
		this.palette = {
			...palette,
			background: rgb(palette.background),
			low: rgb(palette.low),
			high: rgb(palette.high),
			accent: rgb(palette.accent),
			glowColor: rgb(palette.glowColor),
		};
		this.scenes = scenes.map(scene => {
			const shape = SHAPES.indexOf(scene.shape);
			if (shape < 0) throw new Error(`Unknown shape: ${scene.shape}`);
			return { shape, wide: scene.wide ?? [0, 0, 1], tall: scene.tall ?? scene.wide ?? [0, 0, 1] };
		});

		this.particles = createProgram(gl, PARTICLE_VS, PARTICLE_FS);
		this.post = createProgram(gl, POST_VS, POST_FS);

		this.cloud = gl.createVertexArray();
		gl.bindVertexArray(this.cloud);
		attribute(gl, 0, randoms(count * 4), 4);
		attribute(gl, 1, randoms(count * 4), 4);
		this.imageBuffer = attribute(gl, 2, new Float32Array(count * 3), 3, gl.DYNAMIC_DRAW);

		this.triangle = gl.createVertexArray();
		gl.bindVertexArray(this.triangle);
		attribute(gl, 0, new Float32Array([-1, -1, 3, -1, -1, 3]), 2);
		gl.bindVertexArray(null);

		this.target = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.target);
		// Bloom samples the mip chain, so only then does the buffer need one
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.palette.glow > 0 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.framebuffer = gl.createFramebuffer();

		this.time = 0;
		this.clock = 0;
		this.from = initial;
		this.to = initial;
		this.morph = 1;
		this.queued = null;
		this.intro = 0;
		this.energy = 0.5;
		this.hasImage = 0;
		this.pointer = { x: 0, y: 0, active: 0 };
		this.pointerTarget = { x: 0, y: 0, active: 0 };
		this.ripples = new Float32Array(16).fill(-100);
		this.rippleSlot = 0;
		this.width = 0;
		this.height = 0;

		this.resize();
		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(canvas);
		canvas.addEventListener('webglcontextlost', event => {
			event.preventDefault();
			this.stop();
		});
		document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
	}

	resize() {
		const { gl, canvas } = this;
		const cssWidth = Math.max(1, canvas.clientWidth);
		const cssHeight = Math.max(1, canvas.clientHeight);
		const pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
		const width = Math.round(cssWidth * pixelRatio);
		const height = Math.round(cssHeight * pixelRatio);
		if (width === this.width && height === this.height) return;

		this.width = canvas.width = width;
		this.height = canvas.height = height;
		this.pixelRatio = pixelRatio;
		this.aspect = cssWidth / cssHeight;

		gl.bindTexture(gl.TEXTURE_2D, this.target);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.target, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		this.projection = perspective(FOV, this.aspect, 0.1, 50);
		const halfHeight = CAM_Z * Math.tan(FOV / 2);
		this.half = [halfHeight * this.aspect, halfHeight];
	}

	// Dissolve from whatever is showing into scene `index`
	morphTo(index) {
		if (this.morph >= 1) {
			if (index === this.to) return;
			this.from = this.to;
			this.to = index;
			this.morph = 0;
		} else {
			// Mid-flight: finish this morph quickly, then head for the newest request
			this.queued = index === this.to ? null : index;
		}
	}

	setEnergy(value) {
		this.energy = value;
	}

	setPointer(clientX, clientY) {
		this.pointerTarget.x = (clientX / this.canvas.clientWidth) * 2 - 1;
		this.pointerTarget.y = 1 - (clientY / this.canvas.clientHeight) * 2;
		this.pointerTarget.active = 1;
	}

	clearPointer() {
		this.pointerTarget.active = 0;
	}

	ripple(clientX, clientY, strength = 1) {
		const slot = this.rippleSlot++ % 4;
		this.ripples.set(
			[(clientX / this.canvas.clientWidth) * 2 - 1, 1 - (clientY / this.canvas.clientHeight) * 2, this.clock, strength],
			slot * 4,
		);
	}

	setPortrait(points) {
		const { gl } = this;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.imageBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, points.subarray(0, this.count * 3));
		this.hasImage = 1;
	}

	start() {
		if (this.frameId || document.hidden) return;
		this.lastFrame = 0;
		this.frameId = requestAnimationFrame(this.frame);
	}

	stop() {
		cancelAnimationFrame(this.frameId);
		this.frameId = 0;
	}

	frame = now => {
		this.frameId = requestAnimationFrame(this.frame);
		const delta = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 1 / 60;
		this.lastFrame = now;

		const speed = 2 ** ((this.energy - 0.5) * 1.6) * (this.reduceMotion ? 0.3 : 1);
		this.clock += delta;
		this.time += delta * speed;
		this.intro = Math.min(1, this.intro + delta / 2.6);

		if (this.morph < 1) {
			const duration = this.morphDuration * (this.queued === null ? 1 : 0.45);
			this.morph = Math.min(1, this.morph + delta / duration);
			if (this.morph >= 1 && this.queued !== null) {
				this.from = this.to;
				this.to = this.queued;
				this.queued = null;
				this.morph = 0;
			}
		}

		const follow = 1 - Math.exp(-delta * 4);
		const pointer = this.pointer;
		const target = this.pointerTarget;
		pointer.x += (target.x - pointer.x) * follow;
		pointer.y += (target.y - pointer.y) * follow;
		pointer.active += (target.active - pointer.active) * follow;

		this.render();
	};

	render() {
		const { gl, palette } = this;
		// The camera leans a little toward the pointer for parallax
		const eye = [this.pointer.x * 0.45 * this.pointer.active, this.pointer.y * 0.3 * this.pointer.active, CAM_Z];
		const projView = multiply(this.projection, lookAt(eye, [0, 0, 0]));
		const layout = this.aspect < TALL_ASPECT ? 'tall' : 'wide';
		const sceneA = this.scenes[this.from];
		const sceneB = this.scenes[this.to];

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		gl.viewport(0, 0, this.width, this.height);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);

		const p = this.particles.uniforms;
		gl.useProgram(this.particles.program);
		gl.uniformMatrix4fv(p.uProjView, false, projView);
		gl.uniform2fv(p.uHalf, this.half);
		gl.uniform1f(p.uAspect, this.aspect);
		gl.uniform1f(p.uTime, this.time);
		gl.uniform1f(p.uClock, this.clock);
		gl.uniform1i(p.uShapeA, sceneA.shape);
		gl.uniform1i(p.uShapeB, sceneB.shape);
		gl.uniform3fv(p.uPlaceA, sceneA[layout]);
		gl.uniform3fv(p.uPlaceB, sceneB[layout]);
		gl.uniform1f(p.uMorph, this.morph);
		gl.uniform1f(p.uIntro, this.intro);
		gl.uniform1f(p.uEnergy, this.energy);
		gl.uniform1f(p.uHasImage, this.hasImage);
		gl.uniform1f(p.uPointSize, this.pointSize * this.pixelRatio);
		gl.uniform3f(p.uPointer, this.pointer.x, this.pointer.y, this.pointer.active);
		gl.uniform4fv(p.uRipples, this.ripples);
		gl.bindVertexArray(this.cloud);
		gl.drawArrays(gl.POINTS, 0, this.count);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.disable(gl.BLEND);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.target);
		if (palette.glow > 0) gl.generateMipmap(gl.TEXTURE_2D);

		const q = this.post.uniforms;
		gl.useProgram(this.post.program);
		gl.uniform1i(q.uTexture, 0);
		gl.uniform1f(q.uPixelRatio, this.pixelRatio);
		gl.uniform1f(q.uTime, this.clock);
		gl.uniform1f(q.uCell, 1);
		gl.uniform1f(q.uLevels, 3);
		gl.uniform1f(q.uGain, palette.gain);
		gl.uniform1f(q.uGrain, palette.grain);
		// Grain steps at 12 fps, like film
		gl.uniform1f(q.uGrainTime, Math.floor(this.clock * 12));
		gl.uniform1f(q.uDither, this.dither);
		gl.uniform3fv(q.uBackground, palette.background);
		gl.uniform3fv(q.uInkLow, palette.low);
		gl.uniform3fv(q.uInkHigh, palette.high);
		gl.uniform3fv(q.uAccent, palette.accent);
		gl.uniform1f(q.uAccentMix, palette.accentMix);
		gl.uniform3fv(q.uGlowColor, palette.glowColor);
		gl.uniform1f(q.uGlow, palette.glow);
		gl.bindVertexArray(this.triangle);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
	}
}
