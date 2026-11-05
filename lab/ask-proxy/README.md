# Written answers for "Ask about Ali" (optional)

Ask already searches the CV by meaning in the visitor's browser, with no key and no server.
This Worker adds short written answers from an AI model (DeepSeek or OpenAI). The key stays
in Cloudflare's encrypted secrets: it never goes in this repository, in the page, or in a chat.

1. Make a free account at <https://dash.cloudflare.com>, then **Workers & Pages → Create →
   Worker**. Name it (say `ask-ali`) and deploy the starter.
2. **Edit code**: replace everything with [`worker.js`](worker.js), then **Deploy**.
3. **Settings → Variables and secrets → Add**: type **Secret**, name `API_KEY`, value your
   DeepSeek (or OpenAI) key. For OpenAI, also add a **Text** variable `PROVIDER` = `openai`.
4. Optional but wise: in your DeepSeek/OpenAI account, set a monthly spending limit; in the
   Worker, add a **Rate limiting** binding named `LIMITER` (for example 10 requests a minute).
5. Send the Worker's URL (like `https://ask-ali.<you>.workers.dev`): it is public and safe to
   share. It goes in `data-endpoint` on the Ask panel.

The Worker reads the CV from `cv.txt` on the site (`CV_URL` to point elsewhere), answers only
about Ali, at most a few sentences, and accepts questions only from the site's own address.
