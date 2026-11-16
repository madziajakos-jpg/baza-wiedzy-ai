import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';
import { buildBM25, bm25Scores, loadEmb, cosScores, hybrid } from '../js/search-core.js';
const here = path.dirname(fileURLToPath(import.meta.url)); const APP = path.resolve(here, '..');
const meta = JSON.parse(fs.readFileSync(APP + '/data/meta.json'));
const docs = JSON.parse(fs.readFileSync(APP + '/data/docs.json'));
const b = fs.readFileSync(APP + '/data/emb.bin'); const E = loadEmb(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), meta.count, meta.dim);
const idx = buildBM25(docs);
env.allowRemoteModels = false; env.localModelPath = here + '/.cache-models/';
const ex = await pipeline('feature-extraction', meta.model, { dtype: 'q8' });
const qs = process.argv.slice(2).length ? process.argv.slice(2) : ['jak pisać dobre prompty','czym są agenci','halucynacje','streamlit','deep research','jak uniknąć zmyślania przez model','jak napisać maila','jak wytresować smoka LLM','przepis na pierogi','asdfgh','kawa','samochód','pogoda w krakowie'];
for (const q of qs) {
  const v = (await ex('query: ' + q, { pooling: 'mean', normalize: true })).data;
  const cos = cosScores(E, v); const bm = bm25Scores(idx, q);
  const r = hybrid(docs, cos, bm, { wBm: +(process.env.WBM ?? 0.03), wCov: +(process.env.WCOV ?? 0.02) });
  const sorted = [...cos].sort((a, b) => b - a);
  console.log(`\n## ${q}  (n=${r.length}; cos max ${sorted[0].toFixed(3)} p50 ${sorted[350].toFixed(3)})`);
  for (const x of r.slice(0, 5)) { const d = docs[x.i]; console.log(`  ${x.score.toFixed(3)} c${x.cos.toFixed(3)} b${x.bm.toFixed(2)} [${d.type}] ${d.title} — ${d.src}`); }
}
