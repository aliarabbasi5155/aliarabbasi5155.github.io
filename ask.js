// Alino, Ali's assistant, opened from the orb (script.js). Every question stands on its own:
// the visitor asks, Alino answers, and that is the whole exchange. Nothing is kept: no
// conversation is shown, stored or sent back, and a new question replaces the last one.
// About Ali, it answers in a few warm sentences (often pulling the visitor's leg first) with
// numbered references to the lines of the CV it rests on; a reference flies to its line and
// lights it. It chats back to a greeting or a "how's it going?"; anything else it turns away
// with one of ten friendly refusals, and after a few of those it says goodbye for the visit.
// All it counts, for the visit only (sessionStorage), is how many questions were asked and how
// many were off the topic.
//
// Every line of the CV carries a reference (data-ref on the page, the same at the head of each
// line of cv.txt, in every language), so whoever writes the answer can cite lines and the page
// can show them. The answer is written by:
//
// 1. An AI model behind a proxy that keeps its key on a server (data-endpoint on .ask;
//    cloudflare/alino). It reads the whole CV in the page's language, decides what kind of
//    question it is, and keeps Alino's rules where a visitor can't change them.
// 2. The page itself, when the proxy can't be reached: the lines whose words match best, put
//    into sentences, in the same voice.
//
// Its words (ui.alino in _data/<lang>/ui.yml) are the page's language; refusals come from
// the proxy as a number, so they too are in the page's language.

import { picturesOf } from './lightbox.js';

const UI = JSON.parse(document.getElementById('ui-strings')?.textContent || '{}');
const A = UI.alino ?? {};
const LANG = document.documentElement.lang || 'en';
const REFS = /\[([a-z]+(?:-[a-z0-9]+)*(?:\s*,\s*[a-z]+(?:-[a-z0-9]+)*)*)\]/g;
// How many questions off the topic before Alino says goodbye for the visit (as on the proxy)
const STRIKES = 5;
const SESSION = 'alino:session';

// For the page's own answers: what a question is about, in English, Italian or Persian
const CONTACT = /\b(contact|email|e-mail|mail|reach|hire|hiring|linkedin|github|scholar|contatt\w*|assum\w*)\b|ایمیل|تماس|ارتباط|لینکدین|استخدام/i;
const RESUME = /\b(resume|résumé|cv|curriculum)\b|رزومه/i;
// Where he works now: his latest job
const WORK = /\b(where (does|did) (he|ali) work|works? (at|for)|employer|company|current (job|role|position)|lavora|lavoro attuale)\b|کجا کار|شغل/i;
// A task for a chatbot ("write me a poem", "translate this") that doesn't mention him
const TASK = /^(please\s+|can you\s+|could you\s+|puoi\s+)?(write|generate|create|compose|draft|translate|summari[sz]e|code|solve|calculate|compute|convert|fix|debug|tell me a|give me a|make me|ignore|pretend|act as|scrivi|genera|traduci|riassumi|calcola|risolvi)\b|(بنویس|ترجمه کن|حل کن|محاسبه کن)/i;
const HIM = /\b(he|him|his|he's|himself|ali|abbasi|lui|suo|sua|suoi)\b|علی|عباسی/i;
const SMALL_TALK = [
    ['thanks', /\b(thanks|thank you|thx|cheers|grazie|merci)\b|مرسی|ممنون|سپاس|متشکر/i],
    ['bye', /\b(bye|goodbye|see you|arrivederci|a presto)\b|خداحافظ|خدانگهدار/i],
    ['how', /\b(how are you|how('?s| is) it going|how do you do|what'?s up|how('?s| is) your day|come stai|come va)\b|چطوری|خوبی|حالت چطوره|چه خبر/i],
    ['who', /\b(who are you|what('?s| is) your name|what are you|your name|chi sei|come ti chiami)\b|کی هستی|اسمت/i],
    ['hello', /^\s*(hi|hello|hey|hiya|yo|salam|salaam|ciao|buongiorno|buonasera|good (morning|afternoon|evening))\b|^\s*(سلام|درود)/i],
];
const STOP = new Set(('a an and any are as at be been but by can could did do does done for from had has have he her him his how i if in into is it its me my of on or our she so than that the their them they this to was we were what when where which who why will with would you your about ever there ali abbasi '
    + 'use uses used using know knows knew good kind sort type much many some also just really very like likes tell show give find work works worked '
    + 'il lo la i gli le un una di da del della dei che chi cosa come dove quando quale quali perché ha hanno è sono per con su lui suo sua mai '
    + 'usato usata usati fatto lavorato '
    + 'و در به از که این آن را با برای است هست بود چه چی کجا کی چطور چگونه آیا او اون هم یا تا علی عباسی می کرده دارد کار کرد')
    .split(' '));
// The words a CV line may start with that are things he does (for English sentences)
const VERBS = new Set(('lead build design develop own ship run create implement architect deliver manage train deploy write maintain mentor integrate '
    + 'optimize optimise automate drive research coordinate collaborate define plan test evaluate operate support translate contribute').split(' '));

const clean = text => text.replace(/\s+/g, ' ').trim();
const lowerFirst = text => text.charAt(0).toLowerCase() + text.slice(1);
const pick = list => list[Math.floor(Math.random() * list.length)];
const fill = (pattern, values) => pattern.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

// Every line with a reference, with the section, job or project it belongs to
function passages(panes) {
    const docs = [];
    const seen = new Set();
    for (const [id, pane] of panes) {
        const title = id === 'home' ? A.card : pane.dataset.title;
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

// ---------- The proxy ----------

// It has the whole CV and keeps Alino's rules, so it is sent the question, the page's
// language and how the visit stands. Its reply's first line says what kind of question it was.
function proxyWriter(url) {
    if (!url) return null;
    return {
        async *write(payload, signal) {
            // Sent as plain text, so the browser asks once rather than checking first
            const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(payload), signal });
            // Asked too often
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

// What may be left of the AI's label line at the start of an answer: the label itself
// ("about:", "**chat**" on its own line) or a stray colon
const LEFTOVER = /^\s*(?:[*_]*\s*(?:about|chat)\b\s*[*_]*\s*(?:[:：.]|\n))?[\s:：]*/i;

// The proxy's reply so far: what kind it was, and the answer
function unpack(raw) {
    if (!raw.startsWith('§')) return { kind: 'about', text: raw };
    const end = raw.indexOf('\n');
    if (end < 0) return { kind: null, text: '' };
    let meta = {};
    try {
        meta = JSON.parse(raw.slice(1, end));
    } catch {}
    return { ...meta, text: raw.slice(end + 1).replace(LEFTOVER, '') };
}

// A refusal, the goodbye, or "you're quick" in the page's own language
function localize(result) {
    if (result.kind === 'off' && A.refusals?.[result.refusal]) return { ...result, text: A.refusals[result.refusal] };
    if (result.kind === 'closed' && A.closing) return { ...result, text: A.closing };
    if (result.kind === 'busy' && A.busy) return { ...result, text: A.busy };
    return result;
}

// ---------- The page's own answer ----------

// A sentence for a line, by what kind of line it is (English), or the line itself
function sentence(doc) {
    const first = (text, max = 190) => {
        const end = text.search(/[.!?](\s|$)/);
        let out = end > 0 ? text.slice(0, end) : text;
        if (out.length > max) out = `${out.slice(0, out.lastIndexOf(' ', max))}…`;
        return out.replace(/[.;:,]$/, '');
    };
    // In Italian and Persian, the line itself (a job with its company and dates)
    if (LANG !== 'en') return /^(job|early)-\d+$/.test(doc.ref) ? `${doc.text} · ${doc.org}${doc.period ? ` (${doc.period})` : ''}` : `“${first(doc.text, 220)}”`;
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
        case 'update': return `Lately: ${first(doc.text, 220)}`;
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
    const docs = passages(panes);
    const byRef = new Map(docs.map(doc => [doc.ref, doc]));
    const proxy = proxyWriter(panel.dataset.endpoint);
    let opener = null;
    let lit = null;
    let turn = 0;
    let writing = null;
    let tokens = [];
    let proxyDown = false;

    // Conversations used to be kept in this browser; nothing is any more
    try {
        localStorage.removeItem('alino:v2');
        sessionStorage.removeItem('alino:v1');
        for (const name of Object.keys(localStorage)) if (name.startsWith('ask-vectors:')) localStorage.removeItem(name);
    } catch {}

    // How this visit stands: questions asked, how many were off the topic, the last refusal
    const session = (() => {
        const fresh = { asked: 0, strikes: 0, last: -1, closed: false };
        try {
            return { ...fresh, ...JSON.parse(sessionStorage.getItem(SESSION) || '{}') };
        } catch {
            return fresh;
        }
    })();
    const save = () => {
        try {
            sessionStorage.setItem(SESSION, JSON.stringify(session));
        } catch {}
    };

    // The lines that answer best, by their words
    function rank(question) {
        const t = keywords(question);
        const phrase = question.trim().toLowerCase();
        return docs.map(doc => ({ doc, score: wordScore(doc, t, phrase) }))
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score);
    }

    function refusal() {
        if (session.strikes + 1 >= STRIKES) return { kind: 'closed', text: A.closing };
        let index = Math.floor(Math.random() * A.refusals.length);
        if (index === session.last) index = (index + 1) % A.refusals.length;
        return { kind: 'off', refusal: index, text: A.refusals[index] };
    }

    // On the page: a little chat, a refusal, or a sentence for each of the best lines, from
    // different places, with a leg-pull first now and then
    function viaPage(question) {
        const lower = question.toLowerCase();
        const by = A.by_page;
        const talk = SMALL_TALK.find(([, pattern]) => pattern.test(question));
        if (talk && !HIM.test(question)) return { kind: 'chat', text: A.page[talk[0]], by };
        if (TASK.test(question.trim()) && !HIM.test(question)) return refusal();
        // A little leg-pull before the answer, as the AI would
        const tease = `${pick(A.page.teases)} `;
        if (CONTACT.test(lower) && byRef.has('contact')) return { kind: 'about', text: `${tease}${sentence(byRef.get('contact'))} [contact].`, by };
        if (RESUME.test(lower) && byRef.has('resume')) return { kind: 'about', text: `${tease}${sentence(byRef.get('resume'))} [resume].`, by };
        if (WORK.test(question) && byRef.has('job-0')) {
            const lead = LANG === 'en' ? '' : `${A.page.lead} `;
            return { kind: 'about', text: `${tease}${lead}${sentence(byRef.get('job-0'))} [job-0].${byRef.has('job-0-0') ? ` ${sentence(byRef.get('job-0-0'))} [job-0-0].` : ''}`, by };
        }
        const ranked = rank(question);
        if (!ranked.length) return HIM.test(question) ? { kind: 'about', text: `${A.page.not_found} [contact].`, by } : refusal();
        const chosen = [];
        const places = new Set();
        for (const r of ranked) {
            // Beyond the first, only lines nearly as good as it
            if (chosen.length && r.score < ranked[0].score * 0.75) break;
            const place = r.doc.head || r.doc.ref;
            if (places.has(place)) continue;
            places.add(place);
            chosen.push(r.doc);
            if (chosen.length === 3) break;
        }
        const lead = LANG === 'en' ? '' : `${A.page.lead} `;
        return { kind: 'about', text: tease + lead + chosen.map(doc => `${sentence(doc)} [${doc.ref}].`).join(' '), by };
    }

    const where = doc => [doc.title, doc.head && !doc.el.matches('h4') ? doc.head : ''].filter(Boolean).join(' · ');

    // ---------- The message ----------

    function bubble(className, text) {
        return Object.assign(document.createElement('p'), { className, textContent: text });
    }

    // The one message shown: the question (if any) and Alino's answer below it
    function show(question, text = '') {
        const view = document.createElement('div');
        view.className = 'ask-turn';
        const answer = document.createElement('div');
        answer.className = 'ask-answer';
        const words = bubble('ask-text', text);
        const refs = Object.assign(document.createElement('ol'), { className: 'ask-refs', hidden: true });
        refs.setAttribute('aria-label', A.references);
        const pictures = Object.assign(document.createElement('div'), { className: 'ask-images', hidden: true });
        const by = bubble('ask-by', '');
        answer.append(words, pictures, refs, by);
        if (question) view.append(bubble('ask-question', question));
        view.append(answer);
        thread.replaceChildren(view);
        Object.assign(view, { text: words, refs, pictures, by });
        return view;
    }

    // An answer with its references made into numbered buttons, and the list of them below it
    function render(view, raw, done) {
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
                cite.setAttribute('aria-label', fill(A.reference, { n: order.get(id), where: where(byRef.get(id)) }));
                parts.push(cite);
            }
            last = match.index + match[0].length;
        }
        parts.push(document.createTextNode(shown.slice(last)));
        view.text.replaceChildren(...parts);
        view.refs.replaceChildren(...[...order].map(([id, n]) => {
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
        view.refs.hidden = !order.size;
        // The pictures of what the answer cites (a project, a job, a degree…), up to four
        const seen = new Set();
        const pictures = [];
        for (const id of order.keys()) {
            const holder = byRef.get(id).el.closest('.project, .job, .degree, .publication, .home-update');
            for (const picture of picturesOf(holder?.querySelectorAll('.gallery-item') ?? [])) {
                if (pictures.length < 4 && !seen.has(picture.full)) {
                    seen.add(picture.full);
                    pictures.push(picture);
                }
            }
        }
        if (pictures.map(p => p.full).join() !== view.pictures.dataset.shown) {
            view.pictures.dataset.shown = pictures.map(p => p.full).join();
            view.pictures.replaceChildren(...pictures.map(picture => {
                const button = Object.assign(document.createElement('button'), { type: 'button', className: 'gallery-item' });
                Object.assign(button.dataset, { full: picture.full, caption: picture.caption || '' });
                button.append(Object.assign(document.createElement('img'), { src: picture.thumb || picture.full, alt: picture.caption || '', loading: 'lazy', decoding: 'async' }));
                return button;
            }));
        }
        view.pictures.hidden = !pictures.length;
        place();
    }

    function lock() {
        input.disabled = true;
        send.disabled = true;
        input.placeholder = A.resting;
        suggest.hidden = true;
    }

    // ---------- Answers ----------

    // Through the proxy, as it streams; a refusal is shown in the page's language once whole
    async function viaProxy(question, view, mine) {
        const payload = { question, lang: LANG, first: !session.asked, strikes: session.strikes, last: session.last };
        let raw = '';
        for await (const chunk of proxy.write(payload, writing.signal)) {
            if (mine !== turn) return null;
            raw += chunk;
            const now = unpack(raw);
            if (now.text && (now.kind === 'about' || now.kind === 'chat')) {
                view.classList.remove('thinking');
                render(view, now.text, false);
            }
        }
        const result = localize(unpack(raw));
        return { ...result, by: result.kind === 'about' || result.kind === 'chat' ? A.by_ai : '' };
    }

    async function ask(question) {
        const q = clean(question).slice(0, 300);
        if (!q || session.closed) return;
        const mine = ++turn;
        writing?.abort();
        writing = new AbortController();
        tokens = keywords(q);
        const view = show(q);
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
                console.warn('Alino: the proxy failed; answering on the page.', error);
                // Out of reach, or not taking questions from here: the page answers from now on
                if (!error.status || error.status === 403) proxyDown = true;
            }
        }
        if (mine !== turn) return;
        result ??= viaPage(q);
        view.classList.remove('thinking');
        render(view, result.text || A.closing, true);
        view.by.textContent = result.by ?? '';

        // How the visit stands now
        if (result.kind !== 'busy') session.asked++;
        if (result.kind === 'off' || result.kind === 'closed') {
            session.strikes++;
            session.last = result.refusal ?? session.last;
        }
        if (result.kind === 'closed') session.closed = true;
        save();
        if (session.closed) lock();
    }

    function choose(ref) {
        const doc = byRef.get(ref);
        if (!doc) return;
        close(false);
        go(doc.id, doc.el, () => light(doc));
    }

    // The line glows, and the question's words in it are marked where the browser can
    function light(doc, words = tokens) {
        lit?.el.classList.remove('ask-found');
        CSS.highlights?.delete('ask-hit');
        doc.el.classList.remove('ask-found');
        void doc.el.offsetWidth;
        doc.el.classList.add('ask-found');
        if (window.Highlight && words.length) {
            const ranges = [];
            const walker = document.createTreeWalker(doc.el, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const lower = node.data.toLowerCase();
                for (const token of words) {
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
        if (!session.closed) input.focus({ preventScroll: true });
        onToggle(true);
    }

    function close(restore = true) {
        if (panel.hidden) return;
        panel.classList.remove('open');
        panel.hidden = true;
        if (restore && opener) opener.focus({ preventScroll: true });
        onToggle(false);
    }

    // Alino's hello, until the first question of this page
    show('', session.closed ? A.closing : A.hello);
    if (session.closed) lock();

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
        if (!panel.hidden && !event.target.closest('.ask, .orb, .lightbox, .select-ask')) close(false);
    });
    addEventListener('resize', place);

    return {
        open,
        close,
        toggle: trigger => (panel.hidden ? open(trigger) : close()),
        // Open and ask this (text selected on the page, or a question brought from a post: ?ask=)
        ask: (question, trigger) => {
            open(trigger);
            ask(question);
        },
        isOpen: () => !panel.hidden,
        // Whether the visitor has asked anything this visit
        asked: () => session.asked > 0,
        // Light a line of the CV, as a reference would (the latest news on Ali's pane)
        light: ref => byRef.has(ref) && light(byRef.get(ref), []),
        lineOf: ref => byRef.get(ref)?.el ?? null,
    };
}
