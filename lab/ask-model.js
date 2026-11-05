// Lab only: the model behind "Ask about Ali" (lab/ask.js), in a worker so the page stays
// smooth while it thinks. It turns text into vectors that place passages with similar
// meaning close together: all-MiniLM-L6-v2 (or bge-small-en-v1.5), quantized, about 23 MB
// from Hugging Face, run in WebAssembly by transformers.js. Both are fetched the first time Ask opens and kept by the
// browser after that. No key, no server: nothing the visitor types leaves the page.
//
//   → { id, texts: [string], model, pooling }   ← { type: 'progress', value: 0..1 }
//                                    ← { id, type: 'vectors', dims, data: Float32Array }
//                                    ← { id, type: 'error', message }
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

env.allowLocalModels = false;

const extractors = new Map();
let queue = Promise.resolve();

function load(model) {
    if (!extractors.has(model)) extractors.set(model, pipeline('feature-extraction', model, {
        dtype: 'q8',
        progress_callback: event => {
            if (event.status === 'progress' && event.file?.endsWith('.onnx')) postMessage({ type: 'progress', value: event.progress / 100 });
        },
    }));
    return extractors.get(model);
}

// One request at a time: the model runs one batch at a time
onmessage = ({ data }) => {
    queue = queue.then(async () => {
        try {
            const run = await load(data.model);
            const dims = 384;
            const out = new Float32Array(data.texts.length * dims);
            for (let i = 0; i < data.texts.length; i += 16) {
                const batch = await run(data.texts.slice(i, i + 16), { pooling: data.pooling, normalize: true });
                out.set(batch.data, i * dims);
                if (data.texts.length > 16) postMessage({ type: 'progress', value: 1, done: Math.min(1, (i + 16) / data.texts.length) });
            }
            postMessage({ id: data.id, type: 'vectors', dims, data: out }, [out.buffer]);
        } catch (error) {
            postMessage({ id: data.id, type: 'error', message: String(error?.message ?? error) });
        }
    });
};
