// Pomocnik dla scripts/add_new.py: liczy embeddingi multilingual-e5-small (q8, mean, normalize)
// tak samo jak build-data.mjs. Wejście: JSON [tekst,...] na stdin (teksty już z prefiksem "passage: ").
// Wyjście: JSON [[384 float],...] na stdout.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';
const here = path.dirname(fileURLToPath(import.meta.url));
env.allowRemoteModels = false;
env.localModelPath = path.join(here, '.cache-models') + '/';
let raw = ''; for await (const c of process.stdin) raw += c;
const texts = JSON.parse(raw);
const ex = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' });
const out = [];
for (let i = 0; i < texts.length; i += 16) {
  const r = await ex(texts.slice(i, i + 16), { pooling: 'mean', normalize: true });
  for (let j = 0; j < Math.min(16, texts.length - i); j++) out.push(Array.from(r.data.subarray(j * 384, (j + 1) * 384)));
}
process.stdout.write(JSON.stringify(out));
