# Alino, the AI behind the orb

Alino writes its answers with an AI model (DeepSeek or OpenAI) through a small program on
Cloudflare, a *Worker* ([`worker.js`](worker.js)). The Worker holds your API key in Cloudflare's
encrypted secrets, adds your CV in the page's language (`cv.txt`, `it/cv.txt`, `fa/cv.txt`) to
each question and sends it to the model. The key never goes in this repository, in the page,
or in a chat: nobody visiting the site can see it.

Every question stands on its own: the page sends only the question, its language and whether
it is the visitor's first, never a conversation, and the Worker keeps nothing.

**Why not GitHub?** GitHub Pages only serves files; it can't run code when someone asks a
question, and anything in those files is public. GitHub's own *secrets* exist only while a
GitHub Action runs (when the site is built), not when a visitor asks. So the key has to live
on a server that answers visitors: that's the Worker. (Later, GitHub can still be where you
keep the key: a GitHub Action can deploy the Worker and hand it the key. That's optional.)

## Set it up (about 10 minutes, free)

**1. A DeepSeek key.** At <https://platform.deepseek.com>, sign up, add a little credit
(**Top up**, a few dollars lasts a long time: a question costs a small fraction of a cent),
then **API keys → Create new API key**. Copy it somewhere safe for a minute; DeepSeek shows it
only once. Because DeepSeek is paid in advance, it can never cost more than you put in.
(OpenAI works too: <https://platform.openai.com> → API keys; set a monthly budget under
Billing → Limits.)

**2. A Cloudflare account.** Sign up at <https://dash.cloudflare.com/sign-up> (free plan; no
domain needed).

**3. The Worker.** In the dashboard's left menu open **Compute (Workers) → Workers & Pages**,
then **Create → Create Worker** (or **Start with Hello World**). Name it `ask-ali` and click
**Deploy**. Then **Edit code**: select everything in the editor, delete it, paste all of
[`worker.js`](worker.js), and click **Deploy** again.

**4. The keys.** Back on the Worker's page: **Settings → Variables and Secrets → Add**.
Type **Secret**, name `DEEPSEEK_API_KEY`, value: your DeepSeek key; and if you have one,
another **Secret** named `OPENAI_API_KEY` with your OpenAI key. **Deploy**. With both, you can
switch between them from the CMS at any time (below); with one, Alino uses that one. (A key
saved earlier as `API_KEY` still works, as the DeepSeek key, or as the OpenAI key if a
**Text** variable `PROVIDER` says `openai`.)

**5. Its address.** On the Worker's page you'll see its address, like
`https://ask-ali.your-name.workers.dev`. That address is public and safe to share: send it
to me (not the key), and I'll connect Ask to it.

## Check that it answers

Open <https://aliarabbasi5155.github.io>, open the browser's console (F12 or Cmd+Option+J →
Console), paste this with your Worker's address, and press Enter:

```js
fetch('https://ask-ali.your-name.workers.dev', { method: 'POST', body: JSON.stringify({ question: 'Where does Ali work?', lang: 'en', first: true }) }).then(r => r.text()).then(console.log)
```

You should see a first line like `§{"kind":"about"}`, then a short, clever made-up claim that
turns to the truth, then the real answer with references like `[job-0-0]`. Try `lang: 'fa'` or
`lang: 'it'` too, and `question: 'hey, how is it going?'` for a bit of chat.

## What keeps it safe

- The key is a Cloudflare secret: even you can't read it back, only replace it.
- It answers only questions from the site's address, at most 300 characters, a few a minute
  per visitor, in a few sentences, and only about Ali (plus a little friendly chat); anything
  else gets one of ten fixed refusals, and after five of those, a goodbye for the visit.
- To stop it at once: delete the key in **Settings**, or the key itself at DeepSeek.

## Switching the AI

In the CMS, **Settings → Alino's AI**: the provider (DeepSeek or OpenAI), the model (for
example `deepseek-chat`, `gpt-4.1-mini`, `gpt-4.1`), and how often Alino pulls the visitor's
leg. Save, and a few minutes later (the site rebuilds, then the Worker reads `/alino.json`
again) every visitor gets the new choice. No need to touch Cloudflare. If the chosen provider
has no key on the Worker, Alino uses the other one; if the model's name is wrong, it uses the
provider's default model.

Other settings it understands (all optional, as **Text** variables on the Worker): `ORIGINS`
(sites allowed to ask), `SITE` (where the site, its `alino.json` and `cv.txt` files are
published, default `https://aliarabbasi5155.github.io`), `RATE` (questions a minute per
visitor, default 6), and `PROVIDER` and `MODEL`, used only if `alino.json` can't be read.

## When `worker.js` changes

Cloudflare runs the copy you pasted, not this file. When this file changes (Alino's
personality, its rules), open the Worker → **Edit code**, replace everything with the new
[`worker.js`](worker.js) and **Deploy**. The key and settings stay as they are.

The words Alino says on the page itself (its hello, the suggestions, the bubbles beside the
orb, the ten refusals and the goodbye) are in `_data/<lang>/ui.yml` under `alino`, editable in
the CMS as **Site text → Alino**.
