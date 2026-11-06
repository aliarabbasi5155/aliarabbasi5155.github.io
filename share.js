// Sharing a post: the phone's (or the system's) own share sheet where there is one, otherwise
// the link copied, with the button saying so for a moment. Used by the blog's cards on the
// canvas (script.js) and by each post's own page (post.js).

export const canShare = () => typeof navigator.share === 'function';

// The link on the clipboard; true if it got there
export async function copyLink(url) {
    try {
        await navigator.clipboard.writeText(url);
        return true;
    } catch {
        // Without the clipboard API (an http page, an old browser): a hidden field and the old command
        const field = Object.assign(document.createElement('textarea'), { value: url, readOnly: true });
        field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.append(field);
        field.select();
        let done = false;
        try { done = document.execCommand('copy'); } catch {}
        field.remove();
        return done;
    }
}

// The button's words swapped for `text` for a moment (its <span>, or the whole button)
export function flash(button, text) {
    const label = button.querySelector('span') ?? button;
    if (!button.dataset.label) button.dataset.label = label.textContent;
    label.textContent = text;
    button.classList.add('done');
    clearTimeout(button.flashTimer);
    button.flashTimer = setTimeout(() => {
        label.textContent = button.dataset.label;
        button.classList.remove('done');
    }, 1800);
}

// Share { url, title } from `button`: the share sheet, or else the link copied
export async function share({ url, title }, button) {
    if (canShare()) {
        try {
            await navigator.share({ url, title });
            return 'shared';
        } catch (error) {
            // Closed by the visitor: nothing more to do
            if (error?.name === 'AbortError') return 'cancelled';
        }
    }
    if (await copyLink(url)) {
        if (button?.dataset.copied) flash(button, button.dataset.copied);
        return 'copied';
    }
    return 'failed';
}
