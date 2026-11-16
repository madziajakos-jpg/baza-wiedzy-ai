// Web Worker: ładuje model e5 (transformers.js, onnxruntime-wasm) i liczy wektory zapytań.
import { pipeline, env } from '../vendor/transformers.min.js';

const BASE = new URL('../', import.meta.url).href;
const CACHE = 'baza-model-v1';
let extractor = null, modelId = null;

const post = (m) => self.postMessage(m);

// Własny cache: pliki modelu trzymamy w Cache API; duży plik .onnx składamy z części (<50 MB każda,
// bo GitHub nie przyjmuje plików >100 MB).
const modelCache = {
  async match(key) {
    if (typeof key !== 'string' || !key.startsWith(BASE)) return undefined;
    if (key.endsWith('model_quantized.onnx')) return assembleOnnx(key);
    const c = await caches.open(CACHE);
    return (await c.match(key)) || undefined;
  },
  async put(key, resp) {
    if (typeof key !== 'string' || key.endsWith('.onnx')) return;
    const c = await caches.open(CACHE);
    await c.put(key, resp);
  },
};

async function cachedFetch(c, url, onBytes) {
  let r = await c.match(url);
  if (r) { const b = await r.arrayBuffer(); onBytes?.(b.byteLength, true); return b; }
  r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  const reader = r.body.getReader(), chunks = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length; onBytes?.(value.length, false); }
  const blob = new Blob(chunks); const buf = await blob.arrayBuffer();
  await c.put(url, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(buf.byteLength) } }));
  return buf;
}

async function assembleOnnx(url) {
  const c = await caches.open(CACHE);
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const info = JSON.parse(new TextDecoder().decode(await cachedFetch(c, dir + 'parts.json')));
  let loaded = 0, fromCache = true;
  const bufs = [];
  for (const p of info.parts) {
    bufs.push(await cachedFetch(c, dir + p, (n, hit) => {
      loaded += n; if (!hit) fromCache = false;
      post({ type: 'progress', loaded, total: info.size, cached: fromCache });
    }));
  }
  return new Response(new Blob(bufs), { headers: { 'Content-Length': String(info.size) } });
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      modelId = m.model;
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = BASE + 'models/';
      env.useBrowserCache = false;
      env.useCustomCache = true;
      env.customCache = modelCache;
      env.backends.onnx.wasm.wasmPaths = BASE + 'vendor/';
      env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      extractor = await pipeline('feature-extraction', modelId, { dtype: 'q8', device: 'wasm' });
      await extractor('query: rozgrzewka', { pooling: 'mean', normalize: true });
      post({ type: 'ready' });
    } else if (m.type === 'embed') {
      const out = await extractor(m.text, { pooling: 'mean', normalize: true });
      post({ type: 'vec', id: m.id, vec: out.data });
    }
  } catch (err) {
    post({ type: 'error', id: m.id, message: String(err && err.message || err) });
  }
};
