// Concept 4, the chapters (lab only). The field gets a scene for each chapter, its shape
// placed on the side away from the panel; the scene most on screen sets the shape, lights
// its letter on the rail and slides its panel in, scrambling its title the first time.
import { GlassRings } from '../glass-rings.js';
import { SCENES, REDUCE_MOTION, createField, initTheme, scramble, initBlogToggles, initExternalLinks } from './concepts.js';

const scenes = [...document.querySelectorAll('.scene')];
const order = scenes.map(scene => {
    const name = scene.dataset.shape;
    const x = Number(scene.dataset.x);
    const scale = Number(scene.dataset.scale);
    return { shape: SCENES[name]?.shape ?? name, wide: [x, 0, scale], tall: [0, 0.32, scale * 0.6] };
});
const field = createField(order, { initial: 0 });
initTheme(() => field);
initBlogToggles();
initExternalLinks();
new GlassRings(document.querySelector('.hero-rings'), { reduceMotion: REDUCE_MOTION }).start();
scramble(document.querySelector('.hero-name'), undefined, 900);

const railLinks = [...document.querySelectorAll('.rail a')];
const count = document.querySelector('.rail-count');
let current = -1;

function arrive(index) {
    if (index === current) return;
    current = index;
    const scene = scenes[index];
    scene.classList.add('in');
    field?.morphTo(index);
    for (const link of railLinks) {
        if (link.dataset.letter === scene.dataset.letter) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
    }
    count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
    const title = scene.querySelector('.section-title span');
    if (title && !title.dataset.seen) {
        title.dataset.seen = 'true';
        scramble(title);
    }
    if (index > 0) history.replaceState(null, '', `#${scene.id}`);
    else history.replaceState(null, '', location.pathname);
}

// The scene that covers the most of the screen
const seen = new Map();
const observer = new IntersectionObserver(entries => {
    for (const entry of entries) seen.set(entry.target, entry.intersectionRatio);
    let best = 0;
    let index = current;
    scenes.forEach((scene, i) => {
        const ratio = seen.get(scene) ?? 0;
        if (ratio > best) { best = ratio; index = i; }
    });
    if (best > 0.4) arrive(index);
}, { threshold: [0, 0.25, 0.4, 0.55, 0.7, 0.85, 1] });
scenes.forEach(scene => observer.observe(scene));
scenes[0].classList.add('in');
