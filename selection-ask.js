// Text the visitor selects: a small chip beside it, "Ask Alino", that asks about it. Above the
// selection with a mouse, below it on a touch screen (where the system's own menu sits above).
// Used on the canvas (script.js, which opens Alino) and on a post's own page (post.js, which
// goes to the site with the question).

export function initSelectionAsk({ scope, label, ask, exclude = '', min = 3, max = 300 }) {
    if (!scope) return { hide() {} };
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'select-ask';
    chip.hidden = true;
    chip.innerHTML = '<span class="select-ask-dot" aria-hidden="true"></span><span class="select-ask-label"></span>';
    chip.querySelector('.select-ask-label').textContent = label;
    document.body.append(chip);

    const touch = matchMedia('(pointer: coarse)');
    let text = '';
    let under = null;
    let pressing = false;
    let timer = 0;

    const hide = () => {
        chip.classList.remove('on');
        chip.hidden = true;
        text = '';
    };

    const place = () => {
        const selection = getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return hide();
        const range = selection.getRangeAt(0);
        const node = range.commonAncestorContainer;
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!element || !scope.contains(element) || (exclude && element.closest(exclude))) return hide();
        const value = selection.toString().replace(/\s+/g, ' ').trim();
        if (value.length < min || value.length > max) return hide();
        const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
        if (!rects.length) return hide();
        text = value;
        under = element;
        const first = rects[0];
        const last = rects[rects.length - 1];
        const box = range.getBoundingClientRect();
        chip.hidden = false;
        const width = chip.offsetWidth;
        const height = chip.offsetHeight;
        const below = touch.matches || first.top - height - 12 < 8;
        const line = below ? last : first;
        const middle = rects.length > 1 ? box.left + box.width / 2 : line.left + line.width / 2;
        const x = Math.min(Math.max(8, middle - width / 2), innerWidth - width - 8);
        const y = below ? Math.min(line.bottom + (touch.matches ? 18 : 10), innerHeight - height - 8) : first.top - height - 10;
        chip.style.left = `${Math.round(x)}px`;
        chip.style.top = `${Math.round(y)}px`;
        chip.classList.toggle('below', below);
        requestAnimationFrame(() => chip.classList.add('on'));
    };

    const later = (ms = 220) => {
        clearTimeout(timer);
        timer = setTimeout(() => !pressing && place(), ms);
    };

    document.addEventListener('selectionchange', () => {
        if (!getSelection()?.toString().trim()) hide();
        else later();
    });
    document.addEventListener('pointerdown', event => {
        if (event.target.closest('.select-ask')) return;
        pressing = true;
        hide();
    }, true);
    document.addEventListener('pointerup', () => {
        pressing = false;
        later(60);
    }, true);
    document.addEventListener('pointercancel', () => { pressing = false; }, true);
    // A key moves the camera or the text (a selection it extends comes back by itself)
    document.addEventListener('keydown', hide);
    // The text moves away from it: gone until the next selection (a scroll elsewhere leaves it)
    addEventListener('scroll', event => {
        if (text && (event.target === document || event.target.contains?.(under))) hide();
    }, { capture: true, passive: true });
    addEventListener('wheel', hide, { passive: true });
    addEventListener('resize', hide);

    // Keep the selection while pressing the chip
    chip.addEventListener('pointerdown', event => event.preventDefault());
    chip.addEventListener('click', () => {
        if (!text) return;
        const asked = text.length > 240 ? `${text.slice(0, 239).trimEnd()}…` : text;
        hide();
        getSelection()?.removeAllRanges();
        ask(asked);
    });

    return { hide };
}
