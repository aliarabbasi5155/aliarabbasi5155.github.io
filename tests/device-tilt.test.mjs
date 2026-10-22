import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../device-tilt.js', import.meta.url), 'utf8');

function harness({ permission, secure = true, touch = 1, supported = true, reduced = false, legacy = false } = {}) {
    const readings = [];
    const motion = Object.assign(new EventTarget(), { matches: reduced });
    const orientation = Object.assign(new EventTarget(), { angle: 0 });
    const document = Object.assign(new EventTarget(), { hidden: false });
    const button = Object.assign(new EventTarget(), {
        dataset: { enable: 'Enable tilt', disable: 'Disable tilt', unavailable: 'Tilt unavailable' },
    });
    let requests = 0;
    const device = permission ? { requestPermission() { requests++; return permission(); } } : {};
    const window = Object.assign(new EventTarget(), {
        isSecureContext: secure, DeviceOrientationEvent: supported ? device : undefined,
        screen: legacy ? {} : { orientation }, orientation: 0,
    });
    const context = vm.createContext({ window, document, navigator: { maxTouchPoints: touch }, matchMedia: () => motion });
    vm.runInContext(source.replace('export class', 'class') + '\nthis.DeviceTilt = DeviceTilt;', context);
    const tilt = new context.DeviceTilt((x, y) => readings.push([x, y]), button);
    const dispatch = (target, type, values = {}) => target.dispatchEvent(Object.assign(new Event(type), values));
    return {
        tilt, button, document, window, readings, requests: () => requests,
        latest: () => readings.at(-1),
        sample: (beta, gamma) => dispatch(window, 'deviceorientation', { beta, gamma }),
        rotate(angle) {
            if (legacy) { window.orientation = angle; dispatch(window, 'orientationchange'); }
            else { orientation.angle = angle; dispatch(orientation, 'change'); }
        },
        reduce(value) { motion.matches = value; dispatch(motion, 'change'); },
        hide(value) { document.hidden = value; dispatch(document, 'visibilitychange'); },
        click: () => tilt.toggle({ stopPropagation() {} }),
    };
}

test('starts automatically where permitted, calibrates to the holding angle and bounds movement', () => {
    const page = harness();
    page.sample(45, 10);
    assert.equal(page.readings.length, 0);
    page.tilt.start();
    page.sample(45, 10);
    assert.deepEqual(page.latest(), [0, 0]);
    page.sample(60, 30);
    assert.ok(page.latest()[0] > 0.5 && page.latest()[1] > 0.5);
    page.sample(-179, -90);
    assert.ok(page.latest().every(value => Number.isFinite(value) && Math.abs(value) <= 1));
});

test('invalid readings do not calibrate or poison the animation', () => {
    const page = harness();
    page.tilt.start();
    for (const value of [null, undefined, NaN, Infinity]) page.sample(value, 0);
    assert.equal(page.readings.length, 1);
    page.sample(45, 0);
    assert.deepEqual(page.latest(), [0, 0]);
    page.sample(45, null);
    assert.deepEqual(page.latest(), [0, 0]);
});

test('portrait and both landscape directions use screen axes and recalibrate on rotation', () => {
    for (const legacy of [false, true]) {
        const page = harness({ legacy });
        page.tilt.start();
        for (const angle of [0, 90, -90, 180]) {
            page.rotate(angle);
            page.sample(40, 0);
            assert.ok(page.latest().every(value => Math.abs(value) < 1e-10));
            page.sample(65, 0);
            const [x, y] = page.latest();
            if (angle === 90) assert.ok(x > 0.7 && Math.abs(y) < 1e-10);
            if (angle === -90) assert.ok(x < -0.7 && Math.abs(y) < 1e-10);
            if (angle === 0) assert.ok(y > 0.7 && Math.abs(x) < 1e-10);
            if (angle === 180) assert.ok(y < -0.7 && Math.abs(x) < 1e-10);
        }
    }
});

test('pitch crossing the angle boundary takes the short route', () => {
    const page = harness();
    page.tilt.start();
    page.sample(179, 0);
    page.sample(-179, 0);
    assert.ok(page.latest()[1] > 0 && page.latest()[1] < 0.1);
});

test('permission is requested from a click only, and toggling off does not request again', async () => {
    const page = harness({ permission: async () => 'granted' });
    page.tilt.start();
    assert.equal(page.requests(), 0);
    assert.equal(page.button.textContent, 'Enable tilt');
    page.sample(45, 0);
    assert.equal(page.readings.length, 0);
    await page.click();
    assert.equal(page.requests(), 1);
    assert.equal(page.button.textContent, 'Disable tilt');
    page.sample(45, 0);
    page.sample(45, 25);
    assert.ok(page.latest()[0] > 0.7);
    await page.click();
    assert.deepEqual(page.latest(), [0, 0]);
    const count = page.readings.length;
    page.sample(0, -25);
    assert.equal(page.readings.length, count);
    await page.click();
    assert.equal(page.requests(), 1);
});

test('denied and rejected permissions leave sensors off without unhandled rejections', async () => {
    for (const permission of [async () => 'denied', async () => { throw new Error('blocked'); }]) {
        const page = harness({ permission });
        page.tilt.start();
        await page.click();
        assert.equal(page.button.textContent, 'Tilt unavailable');
        assert.equal(page.button.disabled, true);
        page.sample(45, 25);
        assert.equal(page.readings.length, 0);
        await page.click();
        assert.equal(page.requests(), 1);
    }
});

test('offscreen, hidden and reduced-motion states detach sensors and resume with fresh calibration', () => {
    const page = harness();
    page.tilt.start();
    for (const suspend of [value => value ? page.tilt.stop() : page.tilt.start(), value => page.hide(value), value => page.reduce(value)]) {
        page.sample(45, 0);
        page.sample(45, 25);
        assert.ok(page.latest()[0] > 0.7);
        suspend(true);
        assert.deepEqual(page.latest(), [0, 0]);
        const count = page.readings.length;
        page.sample(0, -25);
        assert.equal(page.readings.length, count);
        suspend(false);
        page.sample(45, 0);
        assert.deepEqual(page.latest(), [0, 0]);
    }
});

test('unsupported, insecure, non-touch and reduced-motion devices show no control', () => {
    for (const options of [{ supported: false }, { secure: false }, { touch: 0 }, { reduced: true }]) {
        const page = harness(options);
        page.tilt.start();
        assert.equal(page.button.hidden, true);
        page.sample(45, 25);
        assert.equal(page.readings.length, 0);
    }
});

test('pending permission cannot duplicate requests or restart sensors after destruction', async () => {
    let grant;
    const page = harness({ permission: () => new Promise(resolve => { grant = resolve; }) });
    page.tilt.start();
    const pending = page.click();
    assert.equal(page.button.disabled, true);
    await page.click();
    assert.equal(page.requests(), 1);
    page.tilt.destroy();
    grant('granted');
    await pending;
    page.tilt.start();
    page.hide(true);
    page.hide(false);
    page.sample(45, 25);
    assert.equal(page.readings.length, 0);
    assert.equal(page.button.hidden, true);
});

test('permission resolving while offscreen waits for the scene to return', async () => {
    let grant;
    const page = harness({ permission: () => new Promise(resolve => { grant = resolve; }) });
    page.tilt.start();
    const pending = page.click();
    page.tilt.stop();
    grant('granted');
    await pending;
    page.sample(45, 25);
    assert.equal(page.readings.length, 0);
    page.tilt.start();
    page.sample(45, 25);
    assert.deepEqual(page.latest(), [0, 0]);
});

test('tilt drives the rings and liquid through springs while mouse input keeps priority', () => {
    const ringsSource = readFileSync(new URL('../glass-rings.js', import.meta.url), 'utf8');
    const context = vm.createContext({});
    vm.runInContext(ringsSource.replace(/^export /gm, '') + '\nthis.GlassRings = GlassRings;', context);
    const rings = Object.create(context.GlassRings.prototype);
    Object.assign(rings, {
        size: 400, element: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) },
        pointer: { active: false }, light: { active: false }, open: 0, held: null, put() {},
        discs: Array.from({ length: 5 }, () => ({
            ox: { p: 0, v: 0 }, oy: { p: 0, v: 0 }, scale: { p: 1, v: 0 }, slosh: { p: 0, v: 0 }, kick: Infinity,
        })),
    });
    const settle = () => { for (let frame = 0; frame < 180; frame++) rings.move(frame / 60, 1 / 60); };
    rings.setTilt(0.75, 0.5);
    settle();
    assert.ok(rings.discs[0].ox.p > 0);
    assert.ok(rings.discs[4].ox.p > rings.discs[0].ox.p, 'front layer should have more parallax');
    assert.ok(rings.discs[4].oy.p > 0);
    assert.ok(rings.discs[4].slosh.p < 0, 'liquid should lean with the tilt');
    rings.pointer = { active: true, x: 0, y: 200 };
    settle();
    assert.ok(rings.discs[4].ox.p < 0, 'mouse takes priority');
    rings.pointer.active = false;
    rings.setTilt(0, 0);
    settle();
    assert.ok(Math.abs(rings.discs[4].ox.p) < 0.05, 'disabling tilt should settle back to rest');
});
