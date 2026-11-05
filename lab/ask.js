// Lab only: "Ask about Ali", the spatial canvas's search over the CV (lab/canvas.js opens it
// from the orb). It works in three layers, each used when it is there:
//
// 1. Words. Every passage of every pane is indexed as the page loads; the passages holding
//    all of a question's words rank first. Instant, and always there.
// 2. Meaning. A small embedding model (lab/ask-model.js) turns each passage and the question
//    into vectors, so "has he led a team?" finds "Lead a 2-engineer team". The vectors are a
//    tiny vector database kept in this browser; the two rankings are blended. The model is
//    fetched the first time Ask opens (about 45 MB with its runtime, once).
// 3. Words of its own. Where an LLM is at hand, it writes a short answer from the passages
//    found: Chrome's built-in model when the visitor's browser has it ready, or a proxy that
//    keeps an API key on a server (data-endpoint on .ask; lab/ask-proxy). Otherwise the
//    best passage is the answer.
//
// A result names its section and shows the words in place; choosing it flies there and the
// passage lights up. How to reach Ali and his résumé are answered outright.

// The embedding model: all-MiniLM-L6-v2, small and quick, and clear about what is near and
// what isn't (near: worth showing; sure: the best answer); ?model=bge tries bge-small, made
// for questions against passages (a question is prefixed as it was trained), 34 MB
const MODEL = new URLSearchParams(location.search).get('model') === 'bge'
    ? { id: 'Xenova/bge-small-en-v1.5', pooling: 'cls', query: 'Represent this sentence for searching relevant passages: ', near: 0.6, sure: 0.66 }
    : { id: 'Xenova/all-MiniLM-L6-v2', pooling: 'mean', query: '', near: 0.2, sure: 0.3 };
const CONTACT = /\b(contact|email|e-mail|mail|reach|hire|hiring|linkedin|github|scholar|available|open to work)\b/;
const RESUME = /\b(resume|résumé|cv)\b/;
const STOP = new Set(('a an and any are as at be been but by can could did do does done for from had has have he her him his how i if in into is it its me my of on or our she so than that the their them they this to was we were what when where which who why will with would you your about ever there ali abbasi '
    + 'use uses used using know knows knew good kind sort type much many some also just really very like likes tell show give find work works worked')
    .split(' '));
const SYSTEM = 'You answer questions about Ali Abbasi for visitors to his CV, using only the notes given. Answer in one or two short sentences, in the third person, plainly. If the notes do not answer the question, say that his CV does not mention it.';

const clean = text => text.replace(/\s+/g, ' ').trim();

// The CV, passage by passage, each with the job, project or degree it belongs to
function passages(panes) {
    const docs = [];
    for (const [id, pane] of panes) {
        if (id === 'home') continue;
        const title = pane.dataset.title;
        for (const el of pane.querySelectorAll('.pane-body :is(li, p, h4, .skill-category, .project-tech, .interest-card)')) {
            if (el.closest('.blog-full-content') || el.parentElement.closest('.skill-category, .interest-card')) continue;
            const text = clean(el.textContent);
            if (!text) continue;
            const holder = el.closest('.job, .project, .degree, .publication, .blog-post');
            const head = holder?.querySelector('h4');
            const org = holder?.querySelector('.company, .institution, .project-org, .journal');
            const context = [head && head !== el ? clean(head.textContent) : '', org && !el.contains(org) ? clean(org.textContent) : '']
                .filter(Boolean).join(' · ');
            const tags = [...el.querySelectorAll('.skill-tag, .tech-tag')].map(tag => clean(tag.textContent).toLowerCase());
            docs.push({ id, title, el, text, context, tags, lower: text.toLowerCase() });
        }
    }
    return docs;
}

const words = query => (query.toLowerCase().match(/[\p{L}\p{N}+#]+(?:[.-][\p{L}\p{N}]+)*/gu) ?? []).filter(w => w.length > 1 || /[+#]/.test(w));

function keywords(query) {
    const all = words(query);
    const kept = all.filter(w => !STOP.has(w));
    return kept.length ? kept : all;
}

// Where a word is found: at the start of a word, and for short words (under four letters)
// only as the whole word, so "fun" never finds "function"; -1 when it isn't there
function find(lower, token) {
    const edge = i => i < 0 || i >= lower.length || /[^\p{L}\p{N}]/u.test(lower[i]);
    for (let at = lower.indexOf(token); at >= 0; at = lower.indexOf(token, at + 1)) {
        if (edge(at - 1) && (token.length >= 4 || edge(at + token.length))) return at;
    }
    return -1;
}

// How well a passage holds the words: whole words count more than beginnings, the whole
// phrase and an exact tag more again, and short passages a little over long ones
function wordScore(doc, tokens, phrase, every) {
    let total = 0;
    let found = 0;
    for (const token of tokens) {
        const at = find(doc.lower, token);
        if (at < 0) continue;
        found++;
        total += 1 + (/[^\p{L}\p{N}]/u.test(doc.lower[at + token.length] ?? ' ') ? 1 : 0);
    }
    if (every ? found < tokens.length : !found) return 0;
    if (tokens.length > 1 && doc.lower.includes(phrase)) total += 3;
    if (doc.tags.includes(phrase)) total += 4;
    return total + 1 / (1 + doc.text.length / 160);
}

function hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(36);
}

// The meaning layer: the model in its worker, and every passage's vector, kept in this
// browser between visits
function meaning(docs, report) {
    // A heading carries its section and place, a short item its section; any other passage
    // stands on its own words
    const texts = docs.map(doc => (doc.el.matches('h4') ? `${doc.title}: ${doc.text}${doc.context ? `, ${doc.context}` : ''}`
        : doc.el.matches('.interest-card, .skill-category, .project-tech') ? `${doc.title}: ${doc.text}` : doc.text));
    const key = `ask-vectors:${MODEL.id}:${hash(texts.join('\n'))}`;
    const pending = new Map();
    let worker = null;
    let vectors = null;
    let state = 'idle';
    let count = 0;

    const call = (batch, wait = 90000) => new Promise((resolve, reject) => {
        const id = ++count;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('The model took too long')); }, wait);
        pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        worker.postMessage({ id, texts: batch, model: MODEL.id, pooling: MODEL.pooling });
    });

    function read() {
        try {
            const stored = localStorage.getItem(key);
            if (!stored) return null;
            const bytes = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
            const out = new Float32Array(bytes.buffer);
            return out.length === docs.length * 384 ? out : null;
        } catch {
            return null;
        }
    }

    function write(data) {
        try {
            for (const name of Object.keys(localStorage)) if (name.startsWith('ask-vectors:') && name !== key) localStorage.removeItem(name);
            const bytes = new Uint8Array(data.buffer);
            let text = '';
            for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            localStorage.setItem(key, btoa(text));
        } catch {}
    }

    async function start() {
        if (state !== 'idle') return;
        if (navigator.connection?.saveData) {
            state = 'off';
            return report('off');
        }
        state = 'loading';
        report('loading', 0);
        try {
            worker = new Worker(new URL('./ask-model.js', import.meta.url), { type: 'module' });
            worker.onmessage = ({ data }) => {
                if (data.type === 'progress') return report('loading', data.value);
                const job = pending.get(data.id);
                pending.delete(data.id);
                if (data.type === 'error') job?.reject(new Error(data.message));
                else job?.resolve(data.data);
            };
            worker.onerror = event => {
                event.preventDefault();
                for (const job of pending.values()) job.reject(new Error(event.message || 'The model could not start'));
                pending.clear();
            };
            const cached = read();
            vectors = cached ?? await call(texts);
            if (cached) await call(['warm up']);
            else write(vectors);
            state = 'ready';
            report('ready');
        } catch (error) {
            console.warn('Ask: searching by words only.', error);
            worker?.terminate();
            state = 'off';
            report('off');
        }
    }

    return {
        start,
        get ready() { return state === 'ready'; },
        // How close each passage is to the question, -1 to 1: to the question as asked or
        // to its words without the filler ("has he led a team?", "led team"), the closer
        async similarities(question) {
            if (state !== 'ready') return null;
            const bare = keywords(question).join(' ');
            const asks = [question, ...(bare && bare !== question.toLowerCase() ? [bare] : [])].map(q => MODEL.query + q);
            const q = await call(asks, 15000);
            const out = new Float32Array(docs.length).fill(-1);
            for (let a = 0; a < asks.length; a++) {
                for (let i = 0; i < docs.length; i++) {
                    let dot = 0;
                    for (let j = 0; j < 384; j++) dot += q[a * 384 + j] * vectors[i * 384 + j];
                    out[i] = Math.max(out[i], dot);
                }
            }
            return out;
        },
    };
}

// The writers: an LLM that turns the passages found into an answer, where one is at hand
async function chromeWriter() {
    const LM = self.LanguageModel;
    if (!LM) return null;
    try {
        if (await LM.availability() !== 'available') return null;
    } catch {
        return null;
    }
    return {
        name: 'Chrome’s built-in AI, on this device',
        async *write(question, notes, signal) {
            const session = await LM.create({ initialPrompts: [{ role: 'system', content: SYSTEM }], signal });
            try {
                yield* session.promptStreaming(`Notes from his CV:\n${notes}\n\nQuestion: ${question}`, { signal });
            } finally {
                session.destroy();
            }
        },
    };
}

function proxyWriter(url) {
    if (!url) return null;
    return {
        name: 'an AI model, from his CV',
        async *write(question, notes, signal) {
            const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }), signal });
            if (!response.ok || !response.body) throw new Error(`The AI answered ${response.status}`);
            const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
            for (;;) {
                const { value, done } = await reader.read();
                if (done) return;
                yield value;
            }
        },
    };
}

export function initAsk({ panel, panes, anchor, go, onToggle }) {
    const form = panel.querySelector('.ask-form');
    const input = form.querySelector('input');
    const answer = panel.querySelector('.ask-answer');
    const best = panel.querySelector('.ask-best');
    const bestKind = best.querySelector('.ask-best-kind');
    const bestText = best.querySelector('.ask-best-text');
    const bestWhere = best.querySelector('.ask-where');
    const list = panel.querySelector('.ask-results');
    const suggest = panel.querySelector('.ask-suggest');
    const modeText = panel.querySelector('.ask-mode-text');
    const home = panes.get('home');
    const docs = passages(panes);
    let results = [];
    let top = null;
    let active = 0;
    let opener = null;
    let lit = null;
    let asked = 0;
    let writer = proxyWriter(panel.dataset.endpoint);
    let writing = null;
    let pause = 0;

    const brain = meaning(docs, (state, value) => {
        panel.dataset.mode = state;
        modeText.textContent = {
            loading: `Waking the on-device AI · ${Math.round((value ?? 0) * 100)}%`,
            ready: writer ? `Searching by meaning · answers by ${writer.name}` : 'Searching by meaning, on this device',
            off: 'Searching by words',
        }[state] ?? 'Searching by words';
        if (state === 'ready' && !panel.hidden && input.value.trim()) render(input.value);
    });
    if (!writer) chromeWriter().then(found => { writer = found; });

    function rank(query, similar) {
        const tokens = keywords(query);
        const phrase = query.trim().toLowerCase();
        let byWords = docs.map(doc => wordScore(doc, tokens, phrase, true));
        if (!byWords.some(Boolean)) byWords = docs.map(doc => wordScore(doc, tokens, phrase, false) * 0.5);
        const most = Math.max(0, ...byWords);
        const scored = docs.map((doc, i) => {
            const w = most ? byWords[i] / most : 0;
            const m = similar ? similar[i] : 0;
            return { ...doc, tokens, w, m, score: similar ? m + 0.12 * w : w };
        }).filter(r => (similar ? r.m > MODEL.near || (r.w > 0 && r.m > MODEL.near - 0.1) : r.w > 0));
        scored.sort((a, b) => b.score - a.score);
        // At most three from one section, seven in all
        const per = new Map();
        const out = [];
        for (const result of scored) {
            const n = per.get(result.id) ?? 0;
            if (n >= 3) continue;
            per.set(result.id, n + 1);
            out.push(result);
            if (out.length === 7) break;
        }
        return out;
    }

    // A piece of the passage around the first word found, the words marked
    function snippet(text, tokens, length = 150) {
        const lower = text.toLowerCase();
        const hits = tokens.map(t => lower.indexOf(t)).filter(i => i >= 0);
        const start = hits.length ? Math.max(0, Math.min(...hits) - 46) : 0;
        const piece = (start ? '…' : '') + text.slice(start, start + length) + (start + length < text.length ? '…' : '');
        const span = document.createElement('span');
        span.className = 'ask-snippet';
        if (!tokens.length) {
            span.textContent = piece;
            return span;
        }
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
    const where = result => (result.context ? `${result.title} · ${result.context}` : result.title);

    function showBest(result, kind) {
        top = result;
        best.hidden = !result;
        if (!result) return;
        bestKind.textContent = kind;
        bestText.replaceChildren(snippet(result.text, result.tokens, 260));
        bestWhere.textContent = where(result);
    }

    async function render(query) {
        const q = query.trim();
        const turn = ++asked;
        writing?.abort();
        clearTimeout(pause);
        suggest.hidden = Boolean(q);
        panel.classList.remove('writing');
        results = [];
        top = null;
        best.hidden = true;
        if (!q) {
            answer.textContent = 'Ask anything about Ali, in your own words, or try one of these:';
            return draw();
        }
        const lower = q.toLowerCase();
        if (CONTACT.test(lower)) {
            answer.textContent = 'Ali is open to AI engineering and technical lead roles.';
            showBest({ id: 'home', title: home.dataset.title, context: '', el: home.querySelector('.actions'), text: 'Email, GitHub, LinkedIn and Google Scholar are on his card. Go there to reach him.', tokens: [] }, 'Answer');
            return draw();
        }
        if (RESUME.test(lower)) {
            answer.textContent = 'His résumé is a PDF on his card.';
            showBest({ id: 'home', title: home.dataset.title, context: '', el: home.querySelector('.act-primary'), text: 'Download résumé (PDF)', tokens: [] }, 'Answer');
            return draw();
        }
        // Words first, at once; meaning follows as soon as the model has an answer
        results = rank(q, null);
        draw(q, false);
        if (!brain.ready) return;
        let similar = null;
        try {
            similar = await brain.similarities(q);
        } catch {}
        if (turn !== asked || !similar) return;
        results = rank(q, similar);
        draw(q, true);
    }

    function draw(q = '', smart = false) {
        if (q) {
            clearTimeout(pause);
            top = null;
            best.hidden = true;
        }
        const lead = results[0];
        const confident = lead && (smart ? lead.m >= MODEL.sure || (lead.w === 1 && lead.m >= MODEL.near) : lead.w === 1);
        if (q) {
            const titles = [...new Set(results.map(r => r.title))];
            answer.textContent = results.length
                ? smart ? `Closest to “${q}”: ${names(titles)}.` : `“${q}” comes up in ${names(titles)}.`
                : brain.ready || panel.dataset.mode === 'loading' ? `Nothing close to “${q}” in his CV yet.` : `Nothing on “${q}” yet. Try RAG, Python or AWS.`;
            if (confident) {
                showBest(lead, smart ? 'Best answer' : 'Best match');
                results = results.slice(1);
                if (writer && words(q).length >= 3) pause = setTimeout(() => compose(q, [lead, ...results]), 650);
            }
        }
        active = 0;
        list.replaceChildren(...results.map((result, i) => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ask-result';
            button.dataset.index = i;
            const label = document.createElement('span');
            label.className = 'ask-where';
            label.textContent = where(result);
            button.append(label, snippet(result.text, result.tokens));
            item.append(button);
            return item;
        }));
        markActive();
        place();
    }

    // An LLM's answer in place of the best passage, written as it arrives
    async function compose(question, found) {
        const turn = asked;
        const notes = found.slice(0, 6).map(r => `- (${where(r)}) ${r.text}`).join('\n');
        writing = new AbortController();
        panel.classList.add('writing');
        bestKind.textContent = `Answer by ${writer.name}`;
        let text = '';
        try {
            for await (const chunk of writer.write(question, notes, writing.signal)) {
                if (turn !== asked) return;
                // Older browsers send the whole answer so far, newer ones only what is new
                text = chunk.startsWith(text) ? chunk : text + chunk;
                bestText.textContent = text;
            }
        } catch (error) {
            if (error.name !== 'AbortError' && turn === asked && top) bestText.replaceChildren(snippet(top.text, top.tokens, 260));
        } finally {
            if (turn === asked) panel.classList.remove('writing');
        }
    }

    function markActive() {
        list.querySelectorAll('.ask-result').forEach((button, i) => button.classList.toggle('active', i === active - (top ? 1 : 0)));
        best.classList.toggle('active', Boolean(top) && active === 0);
    }

    function choose(i) {
        const result = top ? (i === 0 ? top : results[i - 1]) : results[i];
        if (!result) return;
        close(false);
        go(result.id, result.el, () => light(result));
    }

    // The passage glows, and its words are marked where the browser can (the Highlight API)
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
            if (ranges.length) CSS.highlights.set('ask-hit', new Highlight(...ranges));
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
        if (panel.hidden) return;
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
        requestAnimationFrame(() => panel.classList.add('open'));
        input.focus({ preventScroll: true });
        input.select();
        onToggle(true);
        brain.start();
    }

    function close(restore = true) {
        if (panel.hidden) return;
        writing?.abort();
        panel.classList.remove('open');
        panel.hidden = true;
        if (restore && opener) opener.focus({ preventScroll: true });
        onToggle(false);
    }

    input.addEventListener('input', () => render(input.value));
    form.addEventListener('submit', event => { event.preventDefault(); choose(active); });
    input.addEventListener('keydown', event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const count = results.length + (top ? 1 : 0);
        if (!count) return;
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
        markActive();
    });
    best.addEventListener('click', () => choose(0));
    list.addEventListener('click', event => {
        const button = event.target.closest('.ask-result');
        if (button) choose(+button.dataset.index + (top ? 1 : 0));
    });
    suggest.addEventListener('click', event => {
        const chip = event.target.closest('.ask-chip');
        if (!chip) return;
        input.value = chip.textContent;
        render(input.value);
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
    addEventListener('resize', place);

    return {
        open,
        close,
        toggle: trigger => (panel.hidden ? open(trigger) : close()),
        isOpen: () => !panel.hidden,
    };
}
