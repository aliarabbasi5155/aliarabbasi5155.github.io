// Concept 3, the pinned dashboard (lab only). Each section owns a stretch of the track: a
// pause to arrive, then as much scroll as its content is longer than the pane. Inside its
// stretch the page's scroll moves the content up; past it, the next section takes over
// with the site's own change (fade, scrambled title, the field's next shape).
import { GlassRings } from '../glass-rings.js';
import { SCENES, REDUCE_MOTION, createField, initTheme, scramble, initBlogToggles, initExternalLinks } from './concepts.js';

const ORDER = Object.keys(SCENES);
const field = createField(ORDER, { initial: 0 });
initTheme(() => field);
initBlogToggles();
initExternalLinks();

// The opening, as on the site: the rings float while it shows, the dots wait until it
// scrolls away, and the field rests while it fills the screen
const opening = document.querySelector('.opening');
const rings = new GlassRings(opening.querySelector('.opening-rings'), { reduceMotion: REDUCE_MOTION });
new IntersectionObserver(([entry]) => (entry.intersectionRatio > 0.01 ? rings.start() : rings.stop()), { threshold: [0, 0.02] }).observe(opening);
const name = opening.querySelector('.opening-name');
scramble(name, name.textContent.trim(), 900);
const covering = () => {
    const { top, bottom } = opening.getBoundingClientRect();
    return top > -1 && bottom >= innerHeight - 1;
};
field?.onFrame(() => {
    const { bottom, height } = opening.getBoundingClientRect();
    const away = 1 - Math.min(1, Math.max(0, bottom / height));
    field.intro = Math.min(field.intro, Math.max(0, (away - 0.25) / 0.75));
    if (covering()) field.stop();
});

const track = document.querySelector('.pin-track');
const contents = document.querySelector('.tab-contents');
const tabs = [...document.querySelectorAll('.tab-content')];
const ids = tabs.map(tab => tab.dataset.tab);
const buttons = [...document.querySelectorAll('.nav-button')];
const badge = document.getElementById('section-badge');
const title = document.getElementById('section-title');
const progress = document.querySelector('.pin-progress');
const wide = window.matchMedia('(min-width: 1101px)');
let ranges = [];
let current = 0;

function measure() {
    if (!wide.matches) {
        track.style.height = '';
        return;
    }
    const pane = contents.clientHeight;
    const dwell = innerHeight * 0.5;
    let start = 0;
    ranges = tabs.map(tab => {
        tab.classList.add('measuring');
        const height = tab.querySelector('.pin-inner').scrollHeight;
        tab.classList.remove('measuring');
        const overflow = Math.max(0, height - pane + 24);
        const range = { start, dwell, overflow, length: dwell + overflow };
        start += range.length;
        return range;
    });
    track.style.height = `${start + innerHeight}px`;
}

function show(index) {
    if (index === current) return;
    const previous = tabs[current];
    current = index;
    buttons.forEach((button, i) => button.classList.toggle('active', i === index));
    badge.textContent = buttons[index].querySelector('.nav-letter').textContent;
    previous.classList.remove('active');
    tabs[index].classList.add('active');
    scramble(title, buttons[index].querySelector('.nav-label').textContent.trim());
    field?.morphTo(index);
    history.replaceState(null, '', `#${ids[index]}`);
}

function update() {
    if (!wide.matches || !ranges.length) return;
    const local = scrollY - track.offsetTop;
    let index = ranges.findIndex(range => local < range.start + range.length);
    if (index < 0) index = ranges.length - 1;
    if (local < 0) index = 0;
    const range = ranges[index];
    const into = Math.max(0, local - range.start);
    const offset = Math.min(range.overflow, Math.max(0, into - range.dwell * 0.35));
    show(index);
    tabs[index].querySelector('.pin-inner').style.transform = `translateY(${-offset}px)`;
    progress.style.setProperty('--progress', Math.min(1, into / range.length).toFixed(3));
}

function go(index, smooth = true) {
    if (!wide.matches) {
        show(index);
        return;
    }
    const top = track.offsetTop + ranges[index].start + 2;
    window.scrollTo({ top, behavior: smooth && !REDUCE_MOTION ? 'smooth' : 'auto' });
}

let queued = false;
window.addEventListener('scroll', () => {
    if (!covering()) field?.start();
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
        queued = false;
        update();
    });
}, { passive: true });
window.addEventListener('resize', () => {
    measure();
    update();
});

buttons.forEach((button, index) => button.addEventListener('click', event => {
    event.preventDefault();
    field?.ripple(event.clientX, event.clientY, 1.2);
    go(index);
}));
opening.querySelector('.opening-down').addEventListener('click', event => {
    event.preventDefault();
    go(0);
});

measure();
document.fonts?.ready.then(() => {
    measure();
    update();
});
const start = ids.indexOf(location.hash.slice(1));
if (start >= 0) requestAnimationFrame(() => go(start, false));
update();
