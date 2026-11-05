// Lab only: Alino, Ali's assistant, opened from the canvas's orb (lab/canvas.js). A visitor
// chats with it in their own words. About Ali, it answers in a few warm sentences with
// numbered references to the lines of the CV it rests on (a reference flies to its line and
// lights it); it takes a little small talk; anything else it turns away with one of ten
// friendly refusals, and after a few of those it says goodbye for the session. The first
// question of a session it meets with a joke.
//
// The conversation is kept for the session (sessionStorage): every message, to show again,
// and, for Alino to remember, a short summary of what came before and the last few messages
// (up to four; every fifth message they are folded into the summary).
//
// Every line of the CV carries a reference (data-ref on the page, the same at the head of
// each line of cv.txt), so whoever writes the answer can cite lines and the page can show
// them. The answer is written by the first of these that is at hand:
//
// 1. An AI model behind a proxy that keeps its key on a server (data-endpoint on .ask;
//    lab/ask-proxy, deployed on Cloudflare). It reads the whole CV, decides what kind of
//    question it is, and keeps Alino's rules where a visitor can't change them.
// 2. Chrome's built-in model, when the visitor's browser has it ready, from the lines that
//    match best.
// 3. The page itself, which puts the best lines into sentences, in the same voice.
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
// What the page's own answer is when a question isn't about Ali
const REFUSE = 'off';
// How much small talk, and how many questions off the topic, before Alino stops (as on the proxy)
const CHATS = 3;
const STRIKES = 5;
// The ten ways Alino turns a question away, and its goodbye: the same as the proxy's
const REFUSALS = [
    'Ooh, tempting! But my brain has room for exactly one topic, and it’s Ali. Want to know what he’s building these days?',
    'I’d love to help, but I’m a one-trick pony, and the trick is Ali 🐴 Ask me about his work, his projects or his studies?',
    'That one’s above my pay grade. I’m paid in questions about Ali, so let’s spend some of those!',
    'Plot twist: I only know about Ali. Shall I tell you about the AI systems he’s shipped?',
    'My manual has a single chapter, and it’s called “Ali”. Want to open it together?',
    'I could guess, but I’d only make something up, and Ali raised me better than that. Ask me about him instead?',
    'You’ve found my one weakness: everything that isn’t Ali. Got a question about him?',
    'I’ll leave that one to the search engines. I’m here for the Ali questions, so fire away!',
    'If I answered that, I’d have to explain myself to Ali. Let’s stick to him: skills, projects, research?',
    'Hmm, that’s outside my little corner of the internet. My corner is all about Ali. What would you like to know?',
];
const CLOSING = 'I think we’ve wandered quite far from Ali, so I’ll take a little break here ☕ Come back anytime with a question about him, and I’ll be all ears!';
// The page's own jokes for a session's first question, and its small talk
const TEASES = [
    'Let me check my notes… oh no, I spilled coffee all over them! Just kidding, they’re fine.',
    'Hmm, that’s classified information… I’m kidding, it’s right there in his CV.',
    'Give me a second, I’m still booting up… just kidding, I was ready the whole time.',
    'Oh, a tough one! Let me think really hard… I’m kidding, it’s one of my favourites.',
    'Wait, are you a recruiter or a spy? Just kidding, I’ll tell you everything.',
];
const SMALL_TALK = [
    [/\b(thanks|thank you|thx|cheers|grazie|merci|mersi|mamnoon)\b/i, 'You’re very welcome! Anything else you’d like to know about Ali?'],
    [/\b(bye|goodbye|see you|ciao ciao|khodahafez)\b/i, 'Bye for now! It was lovely chatting. Come back anytime you’re curious about Ali 👋'],
    [/\b(how are you|how('?s| is) it going|how do you do|what'?s up)\b/i, 'Doing great, thanks for asking! I spend my days talking about Ali, so I can’t complain. What would you like to know about him?'],
    [/\b(who are you|what('?s| is) your name|what are you|your name)\b/i, 'I’m Alino, Ali’s little assistant. I know his CV inside out, so ask away!'],
    [/^(hi|hello|hey|hiya|yo|salam|salaam|ciao|buongiorno|buonasera|good (morning|afternoon|evening))\b/i, 'Hi there! 👋 I’m Alino. Ask me anything about Ali: his work, his projects, his studies…'],
];
const SYSTEM = `You are Alino, the friendly assistant on Ali Abbasi's CV website. Using only the CV lines
given, answer the visitor's question about Ali in one to three short, warm, easy-going sentences, in the
third person, speaking of him kindly. Each line starts with its id in square brackets: cite the ids of
the lines each claim comes from, like [job-0-2]. If the lines don't answer it, say so lightly and suggest
emailing him [contact]. Plain text, in the visitor's language.`;
const STORE = 'alino:v1';

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

// The proxy: it has the whole CV and keeps Alino's rules, so it is sent the question and what
// Alino remembers. Its reply's first line says what kind of question it was; the summary, when
// there is one, comes after a record separator.
function proxyWriter(url) {
    if (!url) return null;
    return {
        name: 'Alino · written by AI from his CV',
        async *write(payload, signal) {
            // Sent as plain text, so the browser asks once rather than checking first
            const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(payload), signal });
            // Asked too often: the proxy's own words say so
            if (response.status === 429) {
                yield `§${JSON.stringify({ kind: 'busy' })}\n${await response.text()}`;
                return;
            }
            if (!response.ok || !response.body) throw Object.assign(new Error(`The proxy answered ${response.status}`), { status: response.status });
            const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
            for (;;) {
                const { value, done } = await reader.read();
                if (done) return;
                yield value;
            }
        },
    };
}

// The proxy's reply so far: what kind it was, the answer, and the summary if it has come
function unpack(raw) {
    if (!raw.startsWith('§')) return { kind: 'about', text: raw, summary: '' };
    const end = raw.indexOf('\n');
    if (end < 0) return { kind: null, text: '', summary: '' };
    let meta = {};
    try {
        meta = JSON.parse(raw.slice(1, end));
    } catch {}
    const [text, extra = ''] = raw.slice(end + 1).split('\u001e');
    let summary = '';
    try {
        summary = extra ? JSON.parse(extra).summary ?? '' : '';
    } catch {}
    return { ...meta, text: text.replace(/^\s+/, ''), summary };
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
        name: 'Alino · written by Chrome’s built-in AI from his CV',
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
    const send = form.querySelector('.ask-send');
    const suggest = panel.querySelector('.ask-suggest');
    const thread = panel.querySelector('.ask-thread');
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
    let proxyDown = false;

    // The conversation, kept for the session
    const state = (() => {
        const fresh = { turns: [], summary: '', recent: [], chats: 0, strikes: 0, closed: false, last: -1 };
        try {
            return { ...fresh, ...JSON.parse(sessionStorage.getItem(STORE) || '{}') };
        } catch {
            return fresh;
        }
    })();
    const save = () => {
        try {
            sessionStorage.setItem(STORE, JSON.stringify(state));
        } catch {}
    };

    const brain = meaning(docs, (mode, value) => {
        if (proxy && !proxyDown) return;
        panel.dataset.mode = mode;
        modeText.textContent = {
            loading: `Alino is reading his CV · ${Math.round((value ?? 0) * 100)}%`,
            ready: chrome ? chrome.name : 'Alino · answers from his CV, worked out on this device',
            off: 'Alino · answers from his CV',
        }[mode];
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
        if (!chosen.length) return 'Hmm, his CV doesn’t mention that one. You could ask him directly, though: his email is on his card [contact].';
        return chosen.map(doc => `${sentence(doc)} [${doc.ref}].`).join(' ');
    }

    const where = doc => [doc.title, doc.head && !doc.el.matches('h4') ? doc.head : ''].filter(Boolean).join(' · ');

    // ---------- The thread ----------

    function bubble(className, text) {
        return Object.assign(document.createElement('p'), { className, textContent: text });
    }

    // A message: the visitor's question, and Alino's answer below it
    function addTurn(question) {
        const view = document.createElement('div');
        view.className = 'ask-turn';
        const answer = document.createElement('div');
        answer.className = 'ask-answer';
        const text = bubble('ask-text', '');
        const refs = Object.assign(document.createElement('ol'), { className: 'ask-refs', hidden: true });
        refs.setAttribute('aria-label', 'References');
        const by = bubble('ask-by', '');
        answer.append(text, refs, by);
        view.append(bubble('ask-question', question), answer);
        thread.append(view);
        Object.assign(view, { text, refs, by });
        return view;
    }

    // An answer with its references made into numbered buttons, and (for the latest answer)
    // the list of them below it
    function render(view, raw, done, list = true) {
        let shown = raw.replace(/\*\*/g, '');
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
        view.text.replaceChildren(...parts);
        view.refs.replaceChildren(...(list ? [...order] : []).map(([id, n]) => {
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
        view.refs.hidden = !list || !order.size;
        thread.scrollTop = thread.scrollHeight;
        place();
    }

    // Alino's hello, when there is no conversation yet
    function hello() {
        const view = document.createElement('div');
        view.className = 'ask-turn ask-hello';
        const answer = document.createElement('div');
        answer.className = 'ask-answer';
        answer.append(bubble('ask-text', 'Hi! I’m Alino 👋 Ask me anything about Ali, his work, his projects, his studies, and I’ll show you where his CV says so.'));
        view.append(answer);
        thread.append(view);
    }

    function lock() {
        input.disabled = true;
        send.disabled = true;
        input.placeholder = 'Alino is taking a little break ☕';
        suggest.hidden = true;
    }

    // ---------- Answers ----------

    // The lines nearest the question, by meaning once the model is ready (it starts here if it
    // hasn't), otherwise by words, and the page's own answer from them
    async function nearby(q, mine) {
        brain.start();
        await brain.settled(20000);
        let similar = null;
        try {
            similar = await brain.similarities(q);
        } catch {}
        if (mine !== turn) return null;
        const ranked = rank(q, similar);
        return { ranked, answer: compose(q, ranked, Boolean(similar)) };
    }

    function refusal() {
        if (state.strikes + 1 >= STRIKES) return { kind: 'closed', text: CLOSING };
        let pick = Math.floor(Math.random() * REFUSALS.length);
        if (pick === state.last) pick = (pick + 1) % REFUSALS.length;
        return { kind: 'off', refusal: pick, text: REFUSALS[pick] };
    }

    // Through the proxy, as it streams
    async function viaProxy(q, view, mine) {
        const payload = {
            question: q,
            summary: state.summary,
            recent: state.recent.slice(-4),
            first: !state.turns.length,
            chats: state.chats,
            strikes: state.strikes,
            last: state.last,
            summarize: (state.turns.length + 1) % 5 === 0,
        };
        let raw = '';
        for await (const chunk of proxy.write(payload, writing.signal)) {
            if (mine !== turn) return null;
            raw += chunk;
            const now = unpack(raw);
            if (now.text) {
                view.classList.remove('thinking');
                render(view, now.text, false);
            }
        }
        return { ...unpack(raw), by: proxy.name };
    }

    // On the page: small talk, a refusal, or the answer from the nearest lines (written by
    // Chrome's model when it has one), with a joke first in a session's first question
    async function viaPage(q, view, mine) {
        const tease = state.turns.length ? '' : `${TEASES[Math.floor(Math.random() * TEASES.length)]} `;
        const talk = SMALL_TALK.find(([pattern]) => pattern.test(q));
        if (talk && !HIM.test(q)) return state.chats >= CHATS ? refusal() : { kind: 'chat', text: tease + talk[1], by: 'Alino' };
        const found = await nearby(q, mine);
        if (!found) return null;
        if (found.answer === REFUSE) return refusal();
        if (chrome) {
            try {
                let text = '';
                for await (const chunk of chrome.write(q, found.ranked.slice(0, 10).map(r => r.doc), writing.signal)) {
                    if (mine !== turn) return null;
                    text += chunk;
                    view.classList.remove('thinking');
                    render(view, tease + text, false);
                }
                if (text.trim()) return { kind: 'about', text: tease + text, by: chrome.name };
            } catch (error) {
                if (error.name === 'AbortError') return null;
            }
        }
        return { kind: 'about', text: tease + found.answer, by: 'Alino · from his CV' };
    }

    async function ask(question) {
        const q = clean(question).slice(0, 300);
        if (!q || state.closed) return;
        const mine = ++turn;
        writing?.abort();
        writing = new AbortController();
        tokens = keywords(q);
        thread.querySelector('.ask-hello')?.remove();
        // Only the latest answer lists its references
        for (const old of thread.querySelectorAll('.ask-refs')) old.hidden = true;
        const view = addTurn(q);
        view.classList.add('thinking');
        suggest.hidden = true;
        input.value = '';
        place();

        let result = null;
        if (proxy && !proxyDown) {
            try {
                result = await viaProxy(q, view, mine);
            } catch (error) {
                if (error.name === 'AbortError' || mine !== turn) return;
                console.warn('Ask: the proxy failed; Alino answers on the page.', error);
                // Out of reach, or not taking questions from here: the page answers from now on
                if (!error.status || error.status === 403) proxyDown = true;
            }
        }
        if (mine !== turn) return;
        result ??= await viaPage(q, view, mine);
        if (!result || mine !== turn) return;
        view.classList.remove('thinking');
        const text = result.text || CLOSING;
        render(view, text, true);
        view.by.textContent = result.kind === 'busy' ? '' : result.by;

        // What Alino remembers, and how the conversation stands
        state.turns.push({ q, a: text, kind: result.kind });
        if (result.kind === 'chat') state.chats++;
        if (result.kind === 'off' || result.kind === 'closed') {
            state.strikes++;
            state.last = result.refusal ?? state.last;
        }
        if (result.kind === 'closed') state.closed = true;
        if (result.kind !== 'busy') state.recent.push({ q, a: text });
        if (result.summary) {
            state.summary = result.summary;
            state.recent = [];
        } else {
            state.recent = state.recent.slice(-4);
        }
        save();
        if (state.closed) lock();
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
        thread.scrollTop = thread.scrollHeight;
        requestAnimationFrame(() => panel.classList.add('open'));
        if (!state.closed) input.focus({ preventScroll: true });
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

    // The conversation so far, as it was left
    if (state.turns.length) {
        state.turns.forEach((saved, i) => {
            const view = addTurn(saved.q);
            render(view, saved.a, true, i === state.turns.length - 1);
        });
        suggest.hidden = true;
    } else {
        hello();
    }
    if (state.closed) lock();

    form.addEventListener('submit', event => {
        event.preventDefault();
        ask(input.value);
    });
    suggest.addEventListener('click', event => {
        const chip = event.target.closest('.ask-chip');
        if (chip) ask(chip.textContent);
    });
    thread.addEventListener('click', event => {
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
