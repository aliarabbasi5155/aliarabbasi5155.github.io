// Pictures, full size. A press on a thumbnail (a .gallery-item on the CV, or one beside an answer
// from Alino) opens its picture over everything, with its caption; the arrows, the arrow keys or
// a swipe go through the rest of its row, and Esc, the close button or a press outside go back.
// The thumbnail shows at once, and the full picture takes its place as soon as it has loaded.

const UI = JSON.parse(document.getElementById('ui-strings')?.textContent || '{}');
const RTL = document.documentElement.dir === 'rtl';
let box = null;
let image = null;
let caption = null;
let count = null;
let items = [];
let index = 0;
let opener = null;

function build() {
    const words = UI.gallery ?? {};
    box = Object.assign(document.createElement('div'), { className: 'lightbox', hidden: true });
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `
        <figure class="lightbox-figure"><img class="lightbox-image" alt=""><figcaption class="lightbox-caption"></figcaption></figure>
        <span class="lightbox-count" aria-hidden="true"></span>
        <button type="button" class="lightbox-close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        <button type="button" class="lightbox-prev"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <button type="button" class="lightbox-next"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`;
    box.querySelector('.lightbox-close').setAttribute('aria-label', words.close ?? 'Close');
    box.querySelector('.lightbox-prev').setAttribute('aria-label', words.previous ?? 'Previous picture');
    box.querySelector('.lightbox-next').setAttribute('aria-label', words.next ?? 'Next picture');
    image = box.querySelector('.lightbox-image');
    caption = box.querySelector('.lightbox-caption');
    count = box.querySelector('.lightbox-count');
    document.body.append(box);

    box.querySelector('.lightbox-close').addEventListener('click', close);
    box.querySelector('.lightbox-prev').addEventListener('click', () => show(index - 1));
    box.querySelector('.lightbox-next').addEventListener('click', () => show(index + 1));
    // A press on the dark around the picture closes it
    box.addEventListener('click', event => {
        if (event.target === box || event.target.classList.contains('lightbox-figure')) close();
    });
    // A swipe across the picture goes to the next or previous one
    let start = null;
    image.addEventListener('pointerdown', event => { start = { x: event.clientX, y: event.clientY }; });
    image.addEventListener('pointerup', event => {
        if (!start) return;
        const dx = event.clientX - start.x;
        start = null;
        if (Math.abs(dx) > 50) show(index + ((dx < 0) !== RTL ? 1 : -1));
    });
    // While it is open, the keys are its own: the canvas behind doesn't move
    addEventListener('keydown', event => {
        if (box.hidden) return;
        const onward = RTL ? 'ArrowLeft' : 'ArrowRight';
        const back = RTL ? 'ArrowRight' : 'ArrowLeft';
        if (event.key === 'Escape') close();
        else if (event.key === onward) show(index + 1);
        else if (event.key === back) show(index - 1);
        else if (event.key !== 'Tab') return;
        if (event.key !== 'Tab') event.preventDefault();
        event.stopPropagation();
    }, { capture: true });
}

function show(i) {
    index = (i + items.length) % items.length;
    const item = items[index];
    image.src = item.thumb || item.full;
    image.alt = item.caption || '';
    caption.textContent = item.caption || '';
    caption.hidden = !item.caption;
    count.textContent = `${index + 1} / ${items.length}`;
    if (item.thumb && item.thumb !== item.full) {
        const full = new Image();
        full.onload = () => { if (items[index] === item) image.src = item.full; };
        full.src = item.full;
    }
}

function close() {
    box.classList.remove('open');
    box.hidden = true;
    opener?.focus({ preventScroll: true });
}

// The pictures of a row: { full, thumb, caption } each
export function openLightbox(list, start = 0, trigger = null) {
    if (!list.length) return;
    if (!box) build();
    items = list;
    opener = trigger;
    box.classList.toggle('single', list.length === 1);
    show(start);
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('open'));
    box.querySelector('.lightbox-close').focus({ preventScroll: true });
}

// The pictures of a .gallery (or any set of .gallery-item buttons)
export const picturesOf = buttons => [...buttons].map(button => ({
    full: button.dataset.full,
    thumb: button.querySelector('img')?.getAttribute('src'),
    caption: button.dataset.caption,
}));

// Every gallery on the page opens its pictures here
export function initGalleries() {
    document.addEventListener('click', event => {
        const button = event.target.closest('.gallery-item');
        if (!button) return;
        const row = [...button.closest('.gallery, .ask-images').querySelectorAll('.gallery-item')];
        openLightbox(picturesOf(row), row.indexOf(button), button);
    });
}
