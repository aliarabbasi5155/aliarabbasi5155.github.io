// Concept 1, the bento board (lab only): the field rests on a quiet shape behind the board;
// a tile grows into the sheet with its full section, the field takes that section's shape,
// and the address gets the section's link (#experience), so Back closes it again.
import { GlassRings } from '../glass-rings.js';
import { SCENES, REDUCE_MOTION, createField, initTheme, scramble, initBlogToggles, initExternalLinks } from './concepts.js';

const ORDER = [...Object.keys(SCENES), { shape: 'ring', wide: [0.2, 0, 0.9], tall: [0, 0.1, 0.8] }];
const IDLE = ORDER.length - 1;

const field = createField(ORDER, { initial: IDLE });
initTheme(() => field);

const rings = new GlassRings(document.querySelector('.tile-rings-stack'), { reduceMotion: REDUCE_MOTION });
rings.start();

const board = document.querySelector('.board');
const sheet = document.querySelector('.sheet');
// While the sheet is open the field draws only its glass, not the tiles' under and around it
const allGlass = [...document.querySelectorAll('.glass')];
const title = sheet.querySelector('.sheet-title');
const body = sheet.querySelector('.sheet-body');
let openId = null;
let opener = null;

const frame = rect => Object.assign(sheet.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` });

function open(id, push = true) {
    const tile = board.querySelector(`[data-section="${id}"]`);
    const template = document.getElementById(`section-${id}`);
    if (!tile || !template) return;
    openId = id;
    opener = tile;
    body.replaceChildren(template.content.cloneNode(true));
    initBlogToggles();
    initExternalLinks();
    body.scrollTop = 0;
    title.textContent = tile.querySelector('.tile-label').textContent;
    sheet.hidden = false;
    sheet.classList.remove('open');
    frame(tile.getBoundingClientRect());
    board.classList.add('dimmed');
    board.inert = true;
    field?.setGlass([sheet]);
    field?.morphTo(Object.keys(SCENES).indexOf(id));
    // From the tile's box to the sheet's, on the next frame so the change animates
    sheet.getBoundingClientRect();
    requestAnimationFrame(() => {
        sheet.removeAttribute('style');
        sheet.classList.add('open');
        scramble(title);
        sheet.querySelector('.sheet-close').focus({ preventScroll: true });
    });
    if (push) history.pushState({ section: id }, '', `#${id}`);
}

function close(push = true) {
    if (!openId) return;
    const tile = opener;
    openId = null;
    frame(tile.getBoundingClientRect());
    sheet.classList.remove('open');
    board.classList.remove('dimmed');
    board.inert = false;
    field?.setGlass(allGlass);
    field?.morphTo(IDLE);
    const done = () => {
        if (openId) return;
        sheet.hidden = true;
        sheet.removeAttribute('style');
        tile.focus({ preventScroll: true });
    };
    if (REDUCE_MOTION) done();
    else setTimeout(done, 560);
    if (push) history.pushState({}, '', location.pathname);
}

board.addEventListener('click', event => {
    const tile = event.target.closest('button.tile');
    if (tile) open(tile.dataset.section);
});
sheet.querySelector('.sheet-close').addEventListener('click', () => close());
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
});
window.addEventListener('popstate', () => {
    const id = location.hash.slice(1);
    if (id && SCENES[id]) open(id, false);
    else close(false);
});

initExternalLinks();
for (const name of document.querySelectorAll('.hero-name')) scramble(name, name.textContent.trim(), 900);
if (SCENES[location.hash.slice(1)]) open(location.hash.slice(1), false);
