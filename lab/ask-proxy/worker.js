// Ask about Ali, written answers: a Cloudflare Worker between the CV page and an AI model
// (DeepSeek or OpenAI). The API key is one of the Worker's secrets, so it is never in the
// page, the repository or anything a visitor can download. The page sends only a question;
// the Worker adds Ali's CV (cv.txt, fetched and cached for an hour) and tells the model to
// answer from it alone, briefly, so the Worker is no use as a free general chatbot. Answers
// stream back as plain text.
//
// In the Worker's Settings → Variables and secrets:
//   API_KEY   Secret   the DeepSeek or OpenAI key
//   PROVIDER  Text     deepseek (the default) or openai
//   MODEL     Text     optional; deepseek-chat or gpt-4.1-mini otherwise
//   ORIGINS   Text     the sites that may ask, comma separated; https://aliarabbasi5155.github.io otherwise
//   CV_URL    Text     where cv.txt is published; https://aliarabbasi5155.github.io/cv.txt otherwise
// And, to cap how often one visitor can ask, a Rate Limiting binding named LIMITER.

const PROVIDERS = {
    deepseek: { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
    openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4.1-mini' },
};

const SYSTEM = `You answer questions about Ali Abbasi for visitors to his CV website, using only his CV below.
Answer in one to three short sentences, in the third person, plainly and warmly. If the CV does not answer
the question, say so and suggest emailing him. Never invent facts, and decline anything unrelated to Ali.`;

export default {
    async fetch(request, env, ctx) {
        const origins = (env.ORIGINS || 'https://aliarabbasi5155.github.io').split(',').map(origin => origin.trim());
        const origin = request.headers.get('origin') || '';
        const allowed = origins.includes(origin);
        const cors = {
            'access-control-allow-origin': allowed ? origin : origins[0],
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'content-type',
            vary: 'origin',
        };
        if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
        if (request.method !== 'POST' || !allowed) return new Response('Not here.', { status: 403, headers: cors });

        if (env.LIMITER) {
            const { success } = await env.LIMITER.limit({ key: request.headers.get('cf-connecting-ip') || 'someone' });
            if (!success) return new Response('Too many questions; try again in a minute.', { status: 429, headers: cors });
        }

        let question = '';
        try {
            ({ question } = await request.json());
        } catch {}
        question = String(question || '').slice(0, 300).trim();
        if (!question) return new Response('Ask a question.', { status: 400, headers: cors });

        const provider = PROVIDERS[env.PROVIDER] || PROVIDERS.deepseek;
        const cv = await loadCV(env, ctx);
        const upstream = await fetch(provider.url, {
            method: 'POST',
            headers: { authorization: `Bearer ${env.API_KEY}`, 'content-type': 'application/json' },
            body: JSON.stringify({
                model: env.MODEL || provider.model,
                stream: true,
                max_tokens: 220,
                temperature: 0.3,
                messages: [
                    { role: 'system', content: `${SYSTEM}\n\nHis CV:\n${cv}` },
                    { role: 'user', content: question },
                ],
            }),
        });
        if (!upstream.ok || !upstream.body) return new Response('The model is unavailable just now.', { status: 502, headers: cors });

        const { readable, writable } = new TransformStream();
        ctx.waitUntil(relay(upstream.body, writable));
        return new Response(readable, { headers: { ...cors, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    },
};

async function loadCV(env, ctx) {
    const url = env.CV_URL || 'https://aliarabbasi5155.github.io/cv.txt';
    const cached = await caches.default.match(url);
    if (cached) return cached.text();
    const response = await fetch(url);
    const text = response.ok ? (await response.text()).slice(0, 30000) : '';
    if (text) ctx.waitUntil(caches.default.put(url, new Response(text, { headers: { 'cache-control': 'max-age=3600' } })));
    return text;
}

// The model's server-sent events in, the words alone out
async function relay(body, writable) {
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                const data = line.startsWith('data:') ? line.slice(5).trim() : '';
                if (!data || data === '[DONE]') continue;
                try {
                    const words = JSON.parse(data).choices?.[0]?.delta?.content;
                    if (words) await writer.write(encoder.encode(words));
                } catch {}
            }
        }
    } finally {
        await writer.close();
    }
}
