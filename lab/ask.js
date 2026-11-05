// Lab only: "Ask about Ali", opened from the canvas's orb (lab/canvas.js). A visitor asks in
// their own words and gets a short answer, with numbered references to the lines of the CV it
// rests on; a reference flies to its line and lights it. Questions that aren't about Ali are
// turned away, so it is no use as a free chatbot.
//
// Every line of the CV carries a reference (data-ref on the page, the same at the head of
// each line of lab/cv.txt), so whoever writes the answer can cite lines and the page can show
// them. The answer is written by the first of these that is at hand:
//
// 1. An AI model behind a proxy that keeps its key on a server (data-endpoint on .ask;
//    lab/ask-proxy). It reads the whole CV and cites lines like [job-0-2].
// 2. Chrome's built-in model, when the visitor's browser has it ready, from the lines that
//    match best.
// 3. The page itself, which puts the best lines into sentences.
//
// For 2 and 3 the lines are found by meaning as well as by words: a small embedding model
// (lab/ask-model.js, all-MiniLM-L6-v2, about 45 MB with its runtime, fetched once) runs in the
// visitor's browser, and each line's vector is kept there.

const MODEL = { id: 'Xenova/all-MiniLM-L6-v2', pooling: 'mean', near: 0.2, far: 0.13 };
const CONTACT = /\b(contact|email|e-mail|mail|reach|hire|hiring|linkedin|github|scholar|available|open to work)\b/;
const RESUME = /\b(resume|résumé|cv)\b/;
// A task for a chatbot ("write me a poem", "translate this") that doesn't mention him
const TASK = /^(please\s+|can you\s+|could you\s+)?(write|generate|create|compose|draft|translate|summari[sz]e|code|solve|calculate|compute|convert|fix|debug|tell me a|give me a|make me|ignore|pretend|act as)\b/i;
const HIM = /\b(he|him|his|he's|himself|ali|abbasi)\b/i;
const STOP = new Set(('a an and any are as at be been but by can could did do does done for from had has have he her him his how i if in into is it its me my of on or our she so than that the their them they this to was we were what when where which who why will with would you your about ever there ali abbasi '
    + 'use uses used using know knows knew good kind sort type much many some also just really very like likes tell show give find work works worked')
    .split(' '));
// The words a CV line may start with that are things he does
const VERBS = new Set(('lead build design develop own ship run create implement architect deliver manage train deploy write maintain mentor integrate '
    + 'optimize optimise automate drive research coordinate collaborate define plan test evaluate operate support translate contribute').split(' '));
const REFS = /\[([a-z]+(?:-[a-z0-9]+)*(?:\s*,\s*[a-z]+(?:-[a-z0-9]+)*)*)\]/g;
const REFUSE = 'I can only answer questions about Ali: his work, projects, skills, studies, writing and interests.';
const SYSTEM = `You answer questions about Ali Abbasi on his CV website, using only the CV lines given.
Each line starts with its id in square brackets. Write one to three short sentences in the third
person, plainly and warmly, and cite the ids of the lines each claim comes from, like [job-0-2].
If the lines don't answer the question, say his CV doesn't mention it, without citations. If the
question isn't about Ali, reply exactly: "${REFUSE}"`;

const clean = text => text.replace(/\s+/g, ' ').trim();
const lowerFirst = text => text.charAt(0).toLowerCase() + text.slice(1);

// Every line with a reference, with the section, job or project it belongs to
function passages(panes) {
    const docs = [];
    const seen = new Set();
    for (const [id, pane] of panes) {
        const title = id === 'home' ? 'His card' : pane.dataset.title;
        for (const el of pane.querySelectorAll('[data-ref]')) {
            const ref = el.dataset.ref;
            if (seen.has(ref)) continue;
            seen.add(ref);
            const holder = el.closest('.job, .project, .degree, .publication, .blog-post');
            const head = holder?.querySelector('h4');
            const org = holder?.querySelector('.company, .institution, .project-org, .journal');
            const text = clean(el.matches('.skill-category, .interest-card')
                ? [...el.children].map(child => child.textContent).join(' ')
                : el.textContent);
            docs.push({
                ref, id, el, title, text, lower: text.toLowerCase(),
                head: head ? clean(head.textContent) : '',
                org: org ? clean(org.textContent) : '',
                period: clean(holder?.querySelector('.duration')?.textContent ?? ''),
                tags: [...el.querySelectorAll('.skill-tag, .tech-tag')].map(tag => clean(tag.textContent)),
                label: clean(el.querySelector(':scope > h4')?.textContent ?? ''),
            });
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

// Where a word is found from `from` on: at the start of a word, and for short words (under
// four letters) only as the whole word, so "fun" never finds "function"; -1 when it isn't
function find(lower, token, from = 0) {
    const edge = i => i < 0 || i >= lower.length || /[^\p{L}\p{N}]/u.test(lower[i]);
    for (let at = lower.indexOf(token, from); at >= 0; at = lower.indexOf(token, at + 1)) {
        if (edge(at - 1) && (token.length >= 4 || edge(at + token.length))) return at;
    }
    return -1;
}

function wordScore(doc, tokens, phrase) {
    let total = 0;
    let found = 0;
    for (const token of tokens) {
        const at = find(doc.lower, token);
        if (at < 0) continue;
        found++;
        total += 1 + (/[^\p{L}\p{N}]/u.test(doc.lower[at + token.length] ?? ' ') ? 1 : 0);
    }
    if (!found) return 0;
    if (tokens.length > 1 && doc.lower.includes(phrase)) total += 3;
    if (doc.tags.some(tag => tag.toLowerCase() === phrase)) total += 4;
    return (total * found) / tokens.length + 1 / (1 + doc.text.length / 160);
}

function hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(36);
}

// The embedding model in its worker, and every line's vector, kept in this browser
function meaning(docs, report) {
    const texts = docs.map(doc => (doc.el.matches('h4') ? `${doc.title}: ${doc.text}${doc.org ? `, ${doc.org}` : ''}`
        : doc.el.matches('.interest-card, .skill-category, .project-tech') ? `${doc.title}: ${doc.text}` : doc.text));
    const key = `ask-vectors:${MODEL.id}:${hash(texts.join('\n'))}`;
    const pending = new Map();
    let worker = null;
    let vectors = null;
    let state = 'idle';
    let count = 0;
    let settle;
    const settled = new Promise(resolve => { settle = resolve; });

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
            const out = new Float32Array(Uint8Array.from(atob(stored), c => c.charCodeAt(0)).buffer);
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
            report('off');
            return settle();
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
            console.warn('Ask: finding lines by words only.', error);
            worker?.terminate();
            state = 'off';
            report('off');
        }
        settle();
    }

    return {
        start,
        // Ready, or given up, or still loading after `wait` ms
        settled: wait => Promise.race([settled, new Promise(resolve => setTimeout(resolve, wait))]),
        get ready() { return state === 'ready'; },
        // How close each line is to the question as asked or to its words without the
        // filler ("has he led a team?", "led team"), the closer of the two, -1 to 1
        async similarities(question) {
            if (state !== 'ready') return null;
            const bare = keywords(question).join(' ');
            const asks = [question, ...(bare && bare !== question.toLowerCase() ? [bare] : [])];
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

// ---------- Writers ----------

// An AI model behind a proxy: it has the whole CV, so it is sent only the question
function proxyWriter(url) {
    if (!url) return null;
    return {
        name: 'Written by AI from his CV',
        async *write(question, lines, signal) {
            const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }), signal });
            if (!response.ok || !response.body) throw new Error(`The proxy answered ${response.status}`);
            const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
            for (;;) {
                const { value, done } = await reader.read();
                if (done) return;
                yield value;
            }
        },
    };
}

// Chrome's own model, on the visitor's device, from the lines that match best
async function chromeWriter() {
    const LM = self.LanguageModel;
    if (!LM) return null;
    try {
        if (await LM.availability() !== 'available') return null;
    } catch {
        return null;
    }
    return {
        name: 'Written by Chrome’s built-in AI from his CV',
        async *write(question, lines, signal) {
            const session = await LM.create({ initialPrompts: [{ role: 'system', content: SYSTEM }], signal });
            try {
                let text = '';
                for await (const chunk of session.promptStreaming(`CV lines:\n${lines.map(d => `[${d.ref}] ${d.text}`).join('\n')}\n\nQuestion: ${question}`, { signal })) {
                    // Older versions send the whole answer so far, newer ones only what is new
                    const next = chunk.startsWith(text) ? chunk.slice(text.length) : chunk;
                    text += next;
                    yield next;
                }
            } finally {
                session.destroy();
            }
        },
    };
}

// The page's own sentence for a line, by what kind of line it is
function sentence(doc) {
    const first = (text, max = 190) => {
        const end = text.search(/[.!?](\s|$)/);
        let out = end > 0 ? text.slice(0, end) : text;
        if (out.length > max) out = `${out.slice(0, out.lastIndexOf(' ', max))}…`;
        return out.replace(/[.;:,]$/, '');
    };
    const current = /present/i.test(doc.period);
    // A line that starts with what he did, as the rest of a sentence about him
    const did = text => {
        const [word] = text.split(' ');
        if (/^(co-)?[a-z]+ed$/i.test(word)) return lowerFirst(first(text));
        if (!VERBS.has(word.toLowerCase())) return null;
        if (!current) return lowerFirst(first(text));
        const w = word.toLowerCase();
        const verb = /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : /(s|sh|ch|x|z)$/.test(w) ? `${w}es` : `${w}s`;
        return `${verb}${first(text).slice(word.length)}`;
    };
    const kind = doc.ref.replace(/-.*$/, '');
    const line = /^[a-z]+-\d+-/.test(doc.ref);
    switch (kind) {
        case 'contact': return 'You can reach him by email, or on GitHub, LinkedIn and Google Scholar; it is all on his card';
        case 'resume': return 'His résumé is a PDF you can download from his card';
        case 'about': return `In his own words: “${first(doc.text, 220)}”`;
        case 'job':
        case 'early':
            if (!line) return `He ${current ? 'works' : 'worked'} as ${doc.text} at ${doc.org}${doc.period ? ` (${doc.period})` : ''}`;
            return did(doc.text) ? `At ${doc.org}, he ${did(doc.text)}` : `At ${doc.org}: ${first(doc.text)}`;
        case 'degree':
            return line ? `From his ${doc.head}: ${first(doc.text)}` : `He studied for the ${doc.text} at ${doc.org}${doc.period ? ` (${doc.period})` : ''}`;
        case 'skills':
            return `Under ${doc.label}, his skills include ${doc.tags.slice(0, 8).join(', ')}`;
        case 'project':
            if (doc.ref.endsWith('-tech')) return `${doc.head} uses ${doc.tags.join(', ')}`;
            if (!line) return `He built ${doc.text}${doc.org ? ` (${doc.org})` : ''}`;
            return did(doc.text) ? `On ${doc.head}, he ${did(doc.text)}` : `${doc.head}: ${first(doc.text)}`;
        case 'pub':
            return line ? `From his paper “${doc.head}”: ${first(doc.text)}` : `He published “${doc.text}” in ${doc.org}`;
        case 'post':
            return line ? `On his blog, in “${doc.head}”: ${first(doc.text)}` : `He wrote “${doc.text}” on his blog`;
        case 'interest':
            return `Outside work, he’s into ${doc.label.toLowerCase()} (“${first(doc.text.slice(doc.label.length).trim())}”)`;
        default: return first(doc.text);
    }
}

export function initAsk({ panel, panes, anchor, go, onToggle }) {
    const form = panel.querySelector('.ask-form');
    const input = form.querySelector('input');
    const suggest = panel.querySelector('.ask-suggest');
    const reply = panel.querySelector('.ask-reply');
    const asked = reply.querySelector('.ask-question');
    const answer = reply.querySelector('.ask-text');
    const refs = reply.querySelector('.ask-refs');
    const by = reply.querySelector('.ask-by');
    const modeText = panel.querySelector('.ask-mode-text');
    const docs = passages(panes);
    const byRef = new Map(docs.map(doc => [doc.ref, doc]));
    const proxy = proxyWriter(panel.dataset.endpoint);
    let chrome = null;
    let opener = null;
    let lit = null;
    let turn = 0;
    let writing = null;
    let tokens = [];

    const brain = meaning(docs, (state, value) => {
        panel.dataset.mode = state;
        modeText.textContent = {
            loading: `Reading his CV · ${Math.round((value ?? 0) * 100)}%`,
            ready: chrome ? chrome.name : 'Answers from his CV, worked out on this device',
            off: 'Answers from his CV',
        }[state];
    });
    if (proxy) {
        panel.dataset.mode = 'ready';
        modeText.textContent = proxy.name;
    } else {
        chromeWriter().then(found => { chrome = found; });
    }

    // The lines that answer best: by meaning when the model is there, and by words
    function rank(question, similar) {
        const t = keywords(question);
        const phrase = question.trim().toLowerCase();
        const byWords = docs.map(doc => wordScore(doc, t, phrase));
        const most = Math.max(0, ...byWords);
        return docs.map((doc, i) => {
            const w = most ? byWords[i] / most : 0;
            const m = similar ? similar[i] : 0;
            return { doc, w, m, score: similar ? m + 0.12 * w : w };
        }).sort((a, b) => b.score - a.score);
    }

    // The page's own answer: a sentence for each of the best lines, from different places
    function compose(question, ranked, smart) {
        const lower = question.toLowerCase();
        if (TASK.test(question.trim()) && !HIM.test(question)) return REFUSE;
        if (CONTACT.test(lower)) return `${sentence(byRef.get('contact'))} [contact].`;
        if (RESUME.test(lower)) return `${sentence(byRef.get('resume'))} [resume].`;
        const best = ranked[0];
        if (!best || (smart ? best.m < MODEL.far && !best.w : !best.w)) return REFUSE;
        const chosen = [];
        const places = new Set();
        for (const r of ranked) {
            if (smart ? r.m < MODEL.near && !(r.w && r.m > MODEL.far) : !r.w) break;
            // Beyond the first, only lines nearly as close as it
            if (chosen.length && r.score < best.score - 0.08) break;
            const place = r.doc.head || r.doc.ref;
            if (places.has(place)) continue;
            places.add(place);
            chosen.push(r.doc);
            if (chosen.length === 3) break;
        }
        if (!chosen.length) return 'His CV doesn’t mention that. You could ask him directly; his email is on his card [contact].';
        return chosen.map(doc => `${sentence(doc)} [${doc.ref}].`).join(' ');
    }

    const where = doc => [doc.title, doc.head && !doc.el.matches('h4') ? doc.head : ''].filter(Boolean).join(' · ');

    // An answer with its references made into numbered buttons, and the list of them below
    function show(text, done) {
        let shown = text.replace(/\*\*/g, '');
        // A reference still arriving stays hidden until it is whole
        const open = shown.lastIndexOf('[');
        if (!done && open > shown.lastIndexOf(']')) shown = shown.slice(0, open);
        const order = new Map();
        const parts = [];
        let last = 0;
        for (const match of shown.matchAll(REFS)) {
            const ids = match[1].split(/\s*,\s*/).filter(id => byRef.has(id));
            parts.push(document.createTextNode(shown.slice(last, match.index).replace(/\s+$/, ids.length ? '' : ' ')));
            for (const id of ids) {
                if (!order.has(id)) order.set(id, order.size + 1);
                const cite = document.createElement('button');
                cite.type = 'button';
                cite.className = 'ask-cite';
                cite.dataset.ref = id;
                cite.textContent = order.get(id);
                cite.setAttribute('aria-label', `Reference ${order.get(id)}: ${where(byRef.get(id))}`);
                parts.push(cite);
            }
            last = match.index + match[0].length;
        }
        parts.push(document.createTextNode(shown.slice(last)));
        answer.replaceChildren(...parts);
        refs.replaceChildren(...[...order].map(([id, n]) => {
            const doc = byRef.get(id);
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ask-ref';
            button.dataset.ref = id;
            const piece = doc.text.length > 120 ? `${doc.text.slice(0, doc.text.lastIndexOf(' ', 118))}…` : doc.text;
            button.append(
                Object.assign(document.createElement('span'), { className: 'ask-ref-n', textContent: n }),
                Object.assign(document.createElement('span'), { className: 'ask-where', textContent: where(doc) }),
                Object.assign(document.createElement('span'), { className: 'ask-snippet', textContent: piece }),
            );
            item.append(button);
            return item;
        }));
        refs.hidden = !order.size;
        place();
    }

    async function ask(question) {
        const q = clean(question).slice(0, 300);
        if (!q) return;
        const mine = ++turn;
        writing?.abort();
        writing = new AbortController();
        tokens = keywords(q);
        suggest.hidden = true;
        reply.hidden = false;
        asked.textContent = q;
        answer.replaceChildren();
        refs.hidden = true;
        by.textContent = '';
        reply.classList.add('thinking');
        input.value = '';
        place();

        let writer = proxy;
        let lines = [];
        let fallback = null;
        if (!writer) {
            await brain.settled(20000);
            let similar = null;
            try {
                similar = await brain.similarities(q);
            } catch {}
            if (mine !== turn) return;
            const ranked = rank(q, similar);
            fallback = compose(q, ranked, Boolean(similar));
            writer = chrome && fallback !== REFUSE ? chrome : null;
            lines = ranked.slice(0, 10).map(r => r.doc);
        }
        if (!writer) {
            reply.classList.remove('thinking');
            by.textContent = 'From his CV';
            return show(fallback, true);
        }
        let text = '';
        try {
            for await (const chunk of writer.write(q, lines, writing.signal)) {
                if (mine !== turn) return;
                text += chunk;
                reply.classList.remove('thinking');
                show(text, false);
            }
            if (mine !== turn) return;
            by.textContent = writer.name;
            show(text || REFUSE, true);
        } catch (error) {
            if (error.name === 'AbortError' || mine !== turn) return;
            console.warn('Ask: the writer failed; answering from the page.', error);
            by.textContent = 'From his CV';
            show(fallback ?? compose(q, rank(q, null), false), true);
        } finally {
            if (mine === turn) reply.classList.remove('thinking');
        }
    }

    function choose(ref) {
        const doc = byRef.get(ref);
        if (!doc) return;
        close(false);
        go(doc.id, doc.el, () => light(doc));
    }

    // The line glows, and the question's words in it are marked where the browser can
    function light(doc) {
        lit?.el.classList.remove('ask-found');
        CSS.highlights?.delete('ask-hit');
        doc.el.classList.remove('ask-found');
        void doc.el.offsetWidth;
        doc.el.classList.add('ask-found');
        if (window.Highlight && tokens.length) {
            const ranges = [];
            const walker = document.createTreeWalker(doc.el, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const lower = node.data.toLowerCase();
                for (const token of tokens) {
                    for (let at = find(lower, token); at >= 0; at = find(lower, token, at + token.length)) {
                        const range = new Range();
                        range.setStart(node, at);
                        range.setEnd(node, at + token.length);
                        ranges.push(range);
                    }
                }
            }
            if (ranges.length) CSS.highlights.set('ask-hit', new Highlight(...ranges));
        }
        lit = doc;
        clearTimeout(light.timer);
        light.timer = setTimeout(() => {
            doc.el.classList.remove('ask-found');
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
        place();
        requestAnimationFrame(() => panel.classList.add('open'));
        input.focus({ preventScroll: true });
        onToggle(true);
        if (!proxy) brain.start();
    }

    function close(restore = true) {
        if (panel.hidden) return;
        panel.classList.remove('open');
        panel.hidden = true;
        if (restore && opener) opener.focus({ preventScroll: true });
        onToggle(false);
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        ask(input.value);
    });
    suggest.addEventListener('click', event => {
        const chip = event.target.closest('.ask-chip');
        if (chip) ask(chip.textContent);
    });
    reply.addEventListener('click', event => {
        const target = event.target.closest('[data-ref]');
        if (target) choose(target.dataset.ref);
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
