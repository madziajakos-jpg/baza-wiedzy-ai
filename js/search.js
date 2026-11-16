import { buildBM25, bm25Scores, loadEmb, cosScores, hybrid, tokens } from './search-core.js';

export const state = { meta: null, docs: [], idx: null, E: null, worker: null, ready: false, failed: false };
let reqId = 0; const pending = new Map();

export async function loadData() {
  const [meta, docs, bin] = await Promise.all([
    fetch('data/meta.json').then(r => r.json()),
    fetch('data/docs.json').then(r => r.json()),
    fetch('data/emb.bin').then(r => r.arrayBuffer()),
  ]);
  state.meta = meta; state.docs = docs;
  state.E = loadEmb(bin, meta.count, meta.dim);
  state.idx = buildBM25(docs);
  return state;
}

export function startModel(onProgress) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL('./embed-worker.js', import.meta.url), { type: 'module' }); }
    catch (e) { state.failed = true; reject(e); return; }
    state.worker = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m);
      else if (m.type === 'ready') { state.ready = true; resolve(); }
      else if (m.type === 'vec') { pending.get(m.id)?.resolve(m.vec); pending.delete(m.id); }
      else if (m.type === 'error') {
        if (m.id != null && pending.has(m.id)) { pending.get(m.id).reject(new Error(m.message)); pending.delete(m.id); }
        else { state.failed = true; reject(new Error(m.message)); }
      }
    };
    w.onerror = (e) => { state.failed = true; reject(new Error(e.message || 'worker error')); };
    w.postMessage({ type: 'init', model: state.meta.model });
  });
}

function embed(text) {
  const id = ++reqId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); state.worker.postMessage({ type: 'embed', id, text }); });
}

export async function search(q) {
  const bm = bm25Scores(state.idx, q);
  let cos = null;
  if (state.ready) {
    try { const v = await embed(state.meta.queryPrefix + q); cos = cosScores(state.E, v); } catch (e) { console.warn(e); }
  }
  const res = hybrid(state.docs, cos, bm);
  return { results: res.map(r => ({ ...r, doc: state.docs[r.i] })), semantic: !!cos };
}

export { tokens };
