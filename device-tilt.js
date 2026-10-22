// A small, screen-relative tilt signal. Sensor events only update targets; the rings'
// existing springs do the animation. No compass or acceleration readings are needed.
export class DeviceTilt {
    constructor(onChange, button) {
        this.onChange = onChange;
        this.button = button;
        this.motion = matchMedia('(prefers-reduced-motion: reduce)');
        this.supported = window.isSecureContext && !!window.DeviceOrientationEvent && navigator.maxTouchPoints > 0;
        this.needsPermission = typeof window.DeviceOrientationEvent?.requestPermission === 'function';
        this.permitted = !this.needsPermission;
        this.enabled = this.supported && this.permitted;
        this.running = false;
        this.listening = false;
        this.pending = false;
        this.unavailable = false;
        this.destroyed = false;
        this.neutral = null;
        this.onVisibility = () => this.sync();
        this.onMotion = () => this.sync();
        document.addEventListener('visibilitychange', this.onVisibility);
        this.motion.addEventListener('change', this.onMotion);
        button?.addEventListener('click', this.toggle);
        this.sync();
    }

    toggle = async event => {
        // The rest of the opening scene is a link down to the page.
        event.stopPropagation();
        if (this.pending || this.unavailable || this.destroyed || this.motion.matches) return;
        if (this.enabled) {
            this.enabled = false;
        } else if (this.permitted) {
            this.enabled = true;
        } else {
            this.pending = true;
            this.sync();
            try {
                // Must be called directly from this click for Safari's user activation.
                this.permitted = await window.DeviceOrientationEvent.requestPermission() === 'granted';
                this.enabled = this.permitted;
                this.unavailable = !this.permitted;
            } catch {
                this.unavailable = true;
            }
            this.pending = false;
        }
        if (!this.destroyed) this.sync();
    };

    reset = () => {
        this.neutral = null;
        this.onChange(0, 0);
    };

    onOrientation = event => {
        if (!this.listening || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
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
        if (this.button) {
            this.button.hidden = !allowed;
            this.button.disabled = this.pending || this.unavailable;
            this.button.textContent = this.button.dataset[this.unavailable ? 'unavailable' : this.enabled ? 'disable' : 'enable'];
        }
        const listen = allowed && this.enabled && this.running && !document.hidden;
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
        this.button?.removeEventListener('click', this.toggle);
        if (this.button) this.button.hidden = true;
    }
}
