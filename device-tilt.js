// A small, screen-relative tilt signal. Sensor events only update targets; the rings'
// existing springs do the animation. No compass or acceleration readings are needed.
export class DeviceTilt {
    constructor(onChange, gestureTarget) {
        this.onChange = onChange;
        this.gestureTarget = gestureTarget;
        this.motion = matchMedia('(prefers-reduced-motion: reduce)');
        this.supported = window.isSecureContext && !!window.DeviceOrientationEvent && navigator.maxTouchPoints > 0;
        this.running = false;
        this.listening = false;
        this.pending = false;
        this.permissionAttempted = false;
        this.denied = false;
        this.hasReadings = false;
        this.destroyed = false;
        this.neutral = null;
        this.onVisibility = () => this.sync();
        this.onMotion = () => this.sync();
        document.addEventListener('visibilitychange', this.onVisibility);
        this.motion.addEventListener('change', this.onMotion);
        gestureTarget?.addEventListener('click', this.requestPermission);
        this.sync();
    }

    requestPermission = async () => {
        if (!this.listening || this.hasReadings || this.pending || this.permissionAttempted || this.destroyed) return;
        if (typeof window.DeviceOrientationEvent?.requestPermission !== 'function') return;
        this.pending = true;
        this.permissionAttempted = true;
        try {
            // Only browsers withholding readings need this. A click on the rings
            // supplies user activation without an extra control or intercepting entry.
            this.denied = await window.DeviceOrientationEvent.requestPermission() !== 'granted';
        } catch {
            this.denied = true;
        }
        this.pending = false;
        if (!this.destroyed) this.sync();
    };

    reset = () => {
        this.neutral = null;
        this.onChange(0, 0);
    };

    onOrientation = event => {
        if (!this.listening || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
        this.hasReadings = true;
        const angle = window.screen.orientation?.angle ?? window.orientation ?? 0;
        if (!this.neutral || this.neutral.angle !== angle) {
            this.neutral = { beta: event.beta, gamma: event.gamma, angle };
        }
        // Calibrate to the way the visitor is holding the device, not to a flat table.
        const pitch = ((event.beta - this.neutral.beta + 540) % 360) - 180;
        const roll = event.gamma - this.neutral.gamma;
        const radians = angle * Math.PI / 180;
        const x = roll * Math.cos(radians) + pitch * Math.sin(radians);
        const y = pitch * Math.cos(radians) - roll * Math.sin(radians);
        // About 25 degrees is a full gesture; extreme readings stay gentle and bounded.
        this.onChange(Math.tanh(x / 25), Math.tanh(y / 25));
    };

    sync() {
        const allowed = this.supported && !this.motion.matches;
        // Having requestPermission() does not mean permission is missing. Chrome
        // exposes it even when sensors are already allowed, so listen immediately.
        const listen = allowed && !this.denied && this.running && !document.hidden;
        if (listen === this.listening) return;
        this.listening = listen;
        this.reset();
        if (listen) {
            window.addEventListener('deviceorientation', this.onOrientation, { passive: true });
            window.addEventListener('orientationchange', this.reset);
            window.screen.orientation?.addEventListener('change', this.reset);
        } else {
            window.removeEventListener('deviceorientation', this.onOrientation);
            window.removeEventListener('orientationchange', this.reset);
            window.screen.orientation?.removeEventListener('change', this.reset);
        }
    }

    start() {
        if (this.destroyed) return;
        this.running = true;
        this.sync();
    }

    stop() {
        this.running = false;
        this.sync();
    }

    destroy() {
        this.stop();
        this.destroyed = true;
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.motion.removeEventListener('change', this.onMotion);
        this.gestureTarget?.removeEventListener('click', this.requestPermission);
    }
}
