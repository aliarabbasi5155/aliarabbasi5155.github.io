// Lab only: "Ask about Ali", the spatial canvas's search over the CV (lab/canvas.js opens it
// from the orb). Every line of every pane is indexed as the page loads; a question is cut
// into words and the lines holding all of them rank first, tags that match exactly and short
// lines above long ones. A result names its section and shows the words in place; choosing
// it flies there, and the line lights up. A few questions are answered outright (how to
// reach Ali, his résumé). Nothing leaves the page.

const CONTACT = /\b(contact|email|e-mail|mail|reach|hire|hiring|linkedin|github|scholar|available|open to work)\b/;
const RESUME = /\b(resume|résumé|cv)\b/;

export function initAsk({ panel, panes, anchor, go, onToggle }) {
    const form = panel.querySelector('.ask-form');
    const input = form.querySelector('input');
    const answer = panel.querySelector('.ask-answer');
    const list = panel.querySelector('.ask-results');
    const suggest = panel.querySelector('.ask-suggest');
    const home = panes.get('home');
    let results = [];
    let active = 0;
    let opener = null;
    let lit = null;

    // Every line worth finding: list items, paragraphs, headings and tags
    const index = [];
    for (const [id, pane] of panes) {
        if (id === 'home') continue;
        const title = pane.dataset.title;
        for (const el of pane.querySelectorAll('.pane-body :is(li, p, h4, .skill-tag, .tech-tag, .journal, .blog-category)')) {
            if (el.closest('.blog-full-content')) continue;
            const text = el.textContent.replace(/\s+/g, ' ').trim();
            if (text) index.push({ id, title, el, text, lower: text.toLowerCase(), tag: el.matches('.skill-tag, .tech-tag') });
        }
    }

    const words = query => (query.toLowerCase().match(/[\p{L}\p{N}+#]+(?:[.-][\p{L}\p{N}]+)*/gu) ?? []).filter(w => w.length > 1 || /[+#]/.test(w));

    function score(item, tokens, phrase, every) {
        let total = 0;
        let found = 0;
        for (const token of tokens) {
            const at = item.lower.indexOf(token);
            if (at < 0) continue;
            found++;
            total += 1 + (at === 0 || /[^\p{L}\p{N}]/u.test(item.lower[at - 1]) ? 1 : 0);
        }
        if (every ? found < tokens.length : !found) return 0;
        if (tokens.length > 1 && item.lower.includes(phrase)) total += 3;
        if (item.tag && item.lower === phrase) total += 4;
        return total + 1 / (1 + item.text.length / 160);
    }

    function search(query) {
        const tokens = words(query);
        if (!tokens.length) return [];
        const phrase = query.trim().toLowerCase();
        let ranked = index.map(item => ({ item, score: score(item, tokens, phrase, true) })).filter(r => r.score);
        if (!ranked.length) ranked = index.map(item => ({ item, score: score(item, tokens, phrase, false) * 0.5 })).filter(r => r.score);
        ranked.sort((a, b) => b.score - a.score);
        // At most three from one section, six in all
        const per = new Map();
        const out = [];
        for (const { item } of ranked) {
            const count = per.get(item.id) ?? 0;
            if (count >= 3) continue;
            per.set(item.id, count + 1);
            out.push({ ...item, tokens });
            if (out.length === 6) break;
        }
        return out;
    }

    // A piece of the line around the first match, the words marked
    function snippet(text, tokens) {
        const lower = text.toLowerCase();
        const first = Math.min(...tokens.map(t => lower.indexOf(t)).filter(i => i >= 0));
        const start = Math.max(0, first - 46);
        const piece = (start ? '…' : '') + text.slice(start, start + 150) + (start + 150 < text.length ? '…' : '');
        const span = document.createElement('span');
        span.className = 'ask-snippet';
        const pattern = new RegExp(tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
        let last = 0;
        for (const match of piece.matchAll(pattern)) {
            span.append(piece.slice(last, match.index));
            const mark = document.createElement('mark');
            mark.textContent = match[0];
            span.append(mark);
            last = match.index + match[0].length;
        }
        span.append(piece.slice(last));
        return span;
    }

    const names = titles => (titles.length > 1 ? `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}` : titles[0]);

    function render(query) {
        const q = query.trim();
        suggest.hidden = Boolean(q);
        results = [];
        if (!q) {
            answer.textContent = 'Search everything on the canvas, or pick one:';
        } else if (CONTACT.test(q.toLowerCase())) {
            answer.textContent = 'Ali is open to AI engineering and technical lead roles. Email, GitHub, LinkedIn and Google Scholar are on his card.';
            results = [{ id: 'home', title: home.dataset.title, el: home.querySelector('.actions'), text: 'Email · GitHub · LinkedIn · Google Scholar', tokens: [] }];
        } else if (RESUME.test(q.toLowerCase())) {
            answer.textContent = 'His résumé downloads from his card, as a PDF.';
            results = [{ id: 'home', title: home.dataset.title, el: home.querySelector('.act-primary'), text: 'Download résumé (PDF)', tokens: [] }];
        } else {
            results = search(q);
            const titles = [...new Set(results.map(r => r.title))];
            answer.textContent = results.length
                ? `“${q}” comes up in ${names(titles)}.`
                : `Nothing on “${q}” yet. Try RAG, Python or AWS.`;
        }
        active = 0;
        list.replaceChildren(...results.map((result, i) => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ask-result';
            button.dataset.index = i;
            const where = document.createElement('span');
            where.className = 'ask-where';
            where.textContent = result.title;
            button.append(where, result.tokens.length ? snippet(result.text, result.tokens) : Object.assign(document.createElement('span'), { className: 'ask-snippet', textContent: result.text }));
            item.append(button);
            return item;
        }));
        markActive();
    }

    function markActive() {
        list.querySelectorAll('.ask-result').forEach((button, i) => button.classList.toggle('active', i === active));
    }

    function choose(i) {
        const result = results[i];
        if (!result) return;
        close(false);
        go(result.id, result.el, () => light(result));
    }

    // The line glows, and its words are marked where the browser can (the Highlight API)
    function light(result) {
        lit?.el.classList.remove('ask-found');
        CSS.highlights?.delete('ask-hit');
        result.el.classList.remove('ask-found');
        void result.el.offsetWidth;
        result.el.classList.add('ask-found');
        if (window.Highlight && result.tokens.length) {
            const ranges = [];
            const walker = document.createTreeWalker(result.el, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const lower = node.data.toLowerCase();
                for (const token of result.tokens) {
                    for (let at = lower.indexOf(token); at >= 0; at = lower.indexOf(token, at + token.length)) {
                        const range = new Range();
                        range.setStart(node, at);
                        range.setEnd(node, at + token.length);
                        ranges.push(range);
                    }
                }
            }
            CSS.highlights.set('ask-hit', new Highlight(...ranges));
        }
        lit = result;
        clearTimeout(light.timer);
        light.timer = setTimeout(() => {
            result.el.classList.remove('ask-found');
            CSS.highlights?.delete('ask-hit');
        }, 4200);
    }

    // Beside the orb, toward the middle of the screen, inside it
    function place() {
        if (matchMedia('(max-width: 760px)').matches) {
            panel.style.removeProperty('left');
            panel.style.removeProperty('top');
            return;
        }
        const { x, y, size } = anchor();
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        const left = x > innerWidth / 2 ? x + size * 0.2 - width : x - size * 0.2;
        let top = y + size * 0.55;
        if (top + height > innerHeight - 16) top = y - size * 0.55 - height;
        panel.style.left = `${Math.round(Math.min(Math.max(16, left), innerWidth - width - 16))}px`;
        panel.style.top = `${Math.round(Math.min(Math.max(16, top), innerHeight - height - 16))}px`;
    }

    function open(trigger) {
        if (!panel.hidden) return;
        opener = trigger ?? null;
        panel.hidden = false;
        render(input.value);
        place();
        requestAnimationFrame(() => panel.classList.add('open'));
        input.focus({ preventScroll: true });
        input.select();
        onToggle(true);
    }

    function close(restore = true) {
        if (panel.hidden) return;
        panel.classList.remove('open');
        panel.hidden = true;
        if (restore && opener) opener.focus({ preventScroll: true });
        onToggle(false);
    }

    input.addEventListener('input', () => { render(input.value); place(); });
    form.addEventListener('submit', event => { event.preventDefault(); choose(active); });
    input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!results.length) return;
            active = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
            markActive();
        }
    });
    list.addEventListener('click', event => {
        const button = event.target.closest('.ask-result');
        if (button) choose(+button.dataset.index);
    });
    suggest.addEventListener('click', event => {
        const chip = event.target.closest('.ask-chip');
        if (!chip) return;
        input.value = chip.textContent;
        render(input.value);
        place();
        input.focus({ preventScroll: true });
    });
    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            close();
        }
    });
    document.addEventListener('pointerdown', event => {
        if (!panel.hidden && !event.target.closest('.ask, .orb')) close(false);
    });
    addEventListener('resize', () => !panel.hidden && place());

    return {
        open,
        close,
        toggle: trigger => (panel.hidden ? open(trigger) : close()),
        isOpen: () => !panel.hidden,
    };
}
