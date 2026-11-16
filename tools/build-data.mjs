// Buduje dane wyszukiwarki: data/docs.json, data/emb.bin, data/meta.json
// + kopiuje model (onnx pocięty na części <50 MB) i pliki runtime do app/.
// Użycie: node tools/build-data.mjs [--include-sensitive] [--kb ../kb]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, '..');
const args = process.argv.slice(2);
const INCLUDE_SENSITIVE = args.includes('--include-sensitive');
const kbIdx = args.indexOf('--kb');
const KB = kbIdx >= 0 ? path.resolve(args[kbIdx + 1]) : path.resolve(APP, '../kb');
const MODEL = 'Xenova/multilingual-e5-small';
const MODEL_CACHE = path.join(here, '.cache-models');
const PART_SIZE = 45 * 1024 * 1024;

// ---------- 1. model download (once) ----------
const mdir = path.join(MODEL_CACHE, MODEL);
const files = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx'];
for (const f of files) {
  const p = path.join(mdir, f);
  if (fs.existsSync(p)) continue;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  console.log('pobieram', f);
  const r = await fetch(`https://huggingface.co/${MODEL}/resolve/main/${f}`);
  if (!r.ok) throw new Error('download failed ' + f);
  fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
}

// ---------- 2. documents ----------
const chunks = JSON.parse(fs.readFileSync(path.join(KB, 'chunks.json'), 'utf8'));
const links = JSON.parse(fs.readFileSync(path.join(KB, 'links.json'), 'utf8'));
const kept = chunks.filter(c => INCLUDE_SENSITIVE || !c.sensitive);
console.log(`fragmenty: ${kept.length}/${chunks.length} (sensitive ${INCLUDE_SENSITIVE ? 'WŁĄCZONE' : 'pominięte'}), linki: ${links.length}`);

const docs = [];
for (const c of kept) {
  docs.push({
    id: c.id, k: 'c', title: c.title, summary: c.summary, text: c.text, type: c.type,
    tags: c.tags || [], src: c.source_file, url: c.webViewLink, section: c.section || '',
    also: (c.also_in || []).map(a => ({ src: a.source_file, url: a.webViewLink })), words: c.words,
  });
}
for (const l of links) {
  const strip = t => String(t || '').replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
  const ctx = strip(l.context && l.context !== l.url ? l.context : '');
  const title = strip(l.title);
  const what = strip(l.what || '');
  const tags = [];
  if (l.category) tags.push(l.category);
  for (const t of (l.lists || [])) if (t && !tags.includes(t)) tags.push(t);
  const listLine = (l.lists || []).map(x => 'Z listy: ' + x).join('\n');
  docs.push({
    id: l.id, k: 'l', title, summary: ctx || (what ? what : `Strona ${l.domain}`),
    text: [what, ctx, listLine, l.section ? 'Znaleziony w: ' + l.section : ''].filter(Boolean).join('\n'), type: 'link',
    tags, src: l.source_file, url: l.url, section: l.section || '',
    docUrl: l.webViewLink, domain: l.domain, what, also: [],
  });
}

const passage = d => d.k === 'l'
  ? `passage: ${d.title}. ${d.what ? d.what + '. ' : ''}${d.tags.join(', ')}. ${d.summary}. ${d.section}`
  : `passage: ${d.title}. ${d.section ? d.section.split(' › ').slice(-1)[0] + '. ' : ''}${d.text}`;

// ---------- 3. embeddings ----------
env.allowRemoteModels = false;
env.localModelPath = MODEL_CACHE + '/';
const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
const DIM = 384;
const emb = new Int8Array(docs.length * DIM);
const scales = new Float32Array(docs.length);
const B = 16;
for (let i = 0; i < docs.length; i += B) {
  const batch = docs.slice(i, i + B).map(passage);
  const out = await extractor(batch, { pooling: 'mean', normalize: true });
  const data = out.data;
  for (let j = 0; j < batch.length; j++) {
    const v = data.subarray(j * DIM, (j + 1) * DIM);
    let m = 0; for (const x of v) m = Math.max(m, Math.abs(x));
    const s = m / 127; scales[i + j] = s;
    for (let k = 0; k < DIM; k++) emb[(i + j) * DIM + k] = Math.round(v[k] / s);
  }
  process.stdout.write(`\rembedding ${Math.min(i + B, docs.length)}/${docs.length}`);
}
console.log();

// ---------- 4. write data ----------
const D = path.join(APP, 'data');
fs.mkdirSync(D, { recursive: true });
// binary: [Float32 scales * N][Int8 emb * N*DIM]
const buf = Buffer.concat([Buffer.from(scales.buffer), Buffer.from(emb.buffer)]);
fs.writeFileSync(path.join(D, 'emb.bin'), buf);
fs.writeFileSync(path.join(D, 'docs.json'), JSON.stringify(docs));
const version = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
fs.writeFileSync(path.join(D, 'meta.json'), JSON.stringify({
  version, model: MODEL, dim: DIM, count: docs.length, chunks: kept.length, links: links.length,
  includeSensitive: INCLUDE_SENSITIVE, queryPrefix: 'query: ',
}, null, 1));

// ---------- 5. model files into app/models (onnx split) ----------
const outM = path.join(APP, 'models', MODEL);
fs.rmSync(outM, { recursive: true, force: true });
fs.mkdirSync(path.join(outM, 'onnx'), { recursive: true });
for (const f of files.slice(0, 4)) fs.copyFileSync(path.join(mdir, f), path.join(outM, f));
const onnx = fs.readFileSync(path.join(mdir, 'onnx/model_quantized.onnx'));
const parts = [];
for (let off = 0, n = 0; off < onnx.length; off += PART_SIZE, n++) {
  const name = `model_quantized.onnx.part${n}`;
  fs.writeFileSync(path.join(outM, 'onnx', name), onnx.subarray(off, off + PART_SIZE));
  parts.push(name);
}
fs.writeFileSync(path.join(outM, 'onnx', 'parts.json'), JSON.stringify({ size: onnx.length, parts }));

// ---------- 6. runtime (transformers.js + onnxruntime wasm) ----------
const V = path.join(APP, 'vendor');
fs.mkdirSync(V, { recursive: true });
const dist = path.join(here, 'node_modules/@huggingface/transformers/dist');
for (const f of ['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'])
  fs.copyFileSync(path.join(dist, f), path.join(V, f));

// ---------- 7. bump service worker version (so phones fetch the new data/app) ----------
const swPath = path.join(APP, 'sw.js');
fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = 'v3-${version}';`));

console.log(`OK: ${docs.length} dokumentów, emb.bin ${(buf.length / 1024).toFixed(0)} KB, wersja ${version}`);
