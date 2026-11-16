// Wspólny rdzeń wyszukiwania (przeglądarka + node): BM25 + cosinus (hybryda)
const FOLD = { 'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z' };
const STOP = new Set(('a aby ale albo am an and are as at be bo by być byc co czy czym czyli dla do gdy gdzie i ich ile in is it ja jak jaka jaki jakie jako je jego jej jest jesli jeśli już juz ku lub ma mi mnie moje mój moj my na nad nie niz niż o od of on ona one oraz po pod przez przy sa są się sie so ta tak tam te tego tej ten the to tu ty tym u w we według wiec więc z za ze że ze zeby żeby czego kiedy który ktory która ktora które ktore mam masz można mozna').split(' '));
export function fold(s) { return s.toLowerCase().replace(/[ąćęłńóśźż]/g, ch => FOLD[ch]); }
const SUFFIXES = ['owania', 'owanie', 'ami', 'ach', 'ów', 'ow', 'om', 'ie', 'ia', 'ii', 'ej', 'ego', 'emu', 'ych', 'ym', 'ymi', 'ow', 'y', 'a', 'e', 'i', 'u', 'o'];
export function stem(w) {
  w = fold(w);
  if (w.length > 5) for (const s of SUFFIXES) { if (w.endsWith(s) && w.length - s.length >= 4) { w = w.slice(0, -s.length); break; } }
  return w.length > 7 ? w.slice(0, 7) : w;
}
export function tokens(s) {
  const out = [];
  for (const m of (s || '').toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = m[0];
    if (w.length < 2 || STOP.has(w) || STOP.has(fold(w))) continue;
    out.push(stem(w));
  }
  return out;
}

export function buildBM25(docs) {
  const N = docs.length, df = new Map(), tfs = [], lens = [];
  for (const d of docs) {
    const tf = new Map();
    const add = (txt, w) => { for (const t of tokens(txt)) tf.set(t, (tf.get(t) || 0) + w); };
    add(d.title, 3); add((d.tags || []).join(' '), 2); add(d.summary, 1); add(d.text, 1); add(d.src, 1);
    let len = 0; for (const v of tf.values()) len += v;
    tfs.push(tf); lens.push(len);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  }
  const avg = lens.reduce((a, b) => a + b, 0) / N;
  return { N, df, tfs, lens, avg };
}
export function bm25Scores(idx, query) {
  const q = [...new Set(tokens(query))], k1 = 1.2, b = 0.75;
  const out = new Float32Array(idx.N), cov = new Float32Array(idx.N);
  const maxIdf = Math.log(1 + (idx.N + 0.5) / 0.5);
  let idfSum = 0;
  for (const t of q) {
    const df = idx.df.get(t);
    const idf = df ? Math.log(1 + (idx.N - df + 0.5) / (df + 0.5)) : maxIdf; // słowo spoza bazy liczy się w mianowniku
    idfSum += idf;
    if (!df) continue;
    for (let i = 0; i < idx.N; i++) {
      const f = idx.tfs[i].get(t); if (!f) continue;
      out[i] += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * idx.lens[i] / idx.avg));
      cov[i] += idf;
    }
  }
  if (idfSum > 0) for (let i = 0; i < idx.N; i++) cov[i] /= idfSum;
  return { scores: out, cov, qTerms: q.length };
}

// emb.bin: Float32 scales[N] + Int8 [N*dim]
export function loadEmb(buffer, N, dim) {
  return { scales: new Float32Array(buffer, 0, N), q: new Int8Array(buffer, N * 4, N * dim), N, dim };
}
export function cosScores(E, qv) {
  const out = new Float32Array(E.N);
  for (let i = 0; i < E.N; i++) {
    let s = 0; const o = i * E.dim;
    for (let k = 0; k < E.dim; k++) s += E.q[o + k] * qv[k];
    out[i] = s * E.scales[i];
  }
  return out;
}

// Hybryda: kosinus (e5 – wartości skupione ok. 0.75-0.9) + znormalizowany BM25.
// Wynik zostaje, gdy pasuje słowami (pokrycie ważonych słów zapytania >= 50%)
// albo znaczeniem bardzo wyraźnie (cos >= strongCos).
export function hybrid(docs, cos, bm, opts = {}) {
  const { wBm = 0.03, wCov = 0.02, k = 30, minCov = 0.5, strongCos = 0.866 } = opts;
  let maxBm = 0; for (const v of bm.scores) maxBm = Math.max(maxBm, v);
  const res = [];
  for (let i = 0; i < docs.length; i++) {
    const b = maxBm > 0 ? bm.scores[i] / maxBm : 0;
    const c = cos ? cos[i] : 0, cv = bm.cov[i];
    const score = (cos ? c : 0) + wBm * b + wCov * cv + (docs[i].k === 'l' ? -0.01 : 0);
    res.push({ i, score, cos: c, bm: b, cov: cv });
  }
  res.sort((a, b) => b.score - a.score);
  return res.filter(r => r.cov >= minCov || (cos && r.cos >= strongCos)).slice(0, k);
}
