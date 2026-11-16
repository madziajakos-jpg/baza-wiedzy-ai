// Baza wiedzy AI – proxy do OpenAI (Cloudflare Worker).
// Klucz OpenAI jest TYLKO w sekrecie Workera (env.OPENAI_API_KEY) – nigdy w kodzie ani w repo.

const ALLOWED_ORIGINS = ['https://madziajakos-jpg.github.io'];
const MAX_INPUT_CHARS = 24000;
const MAX_OUTPUT_TOKENS = 2500;
const RATE_PER_HOUR = 20;
// USD za 1 mln tokenów [wejście, wyjście]
const PRICES = {
  'gpt-4o-mini': [0.15, 0.60],
  'gpt-4.1-mini': [0.40, 1.60],
  'gpt-4.1-nano': [0.10, 0.40],
  'gpt-5-mini': [0.25, 2.00],
};
const KINDS = ['instrukcja', 'lekcja', 'prezentacja', 'fiszki', 'test'];

// ---------- JSON schemas (Structured Outputs, strict) ----------
const S = {
  str: { type: 'string' },
  arr: (items) => ({ type: 'array', items }),
  obj: (props) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false }),
};
const SCHEMAS = {
  instrukcja: S.obj({
    title: S.str, intro: S.str,
    steps: S.arr(S.obj({ title: S.str, detail: S.str })),
    tips: S.arr(S.str),
  }),
  lekcja: S.obj({
    title: S.str, intro: S.str,
    sections: S.arr(S.obj({ heading: S.str, content: S.str })),
    questions: S.arr(S.obj({ q: S.str, a: S.str })),
    summary: S.str,
  }),
  prezentacja: S.obj({
    title: S.str, subtitle: S.str,
    slides: S.arr(S.obj({ title: S.str, bullets: S.arr(S.str), note: S.str })),
  }),
  fiszki: S.obj({
    title: S.str,
    cards: S.arr(S.obj({ q: S.str, a: S.str })),
  }),
  test: S.obj({
    title: S.str,
    questions: S.arr(S.obj({ q: S.str, options: S.arr(S.str), correct: { type: 'integer' }, explanation: S.str })),
  }),
};
const KIND_RULES = {
  instrukcja: 'Zrób praktyczną INSTRUKCJĘ krok po kroku: "intro" (1–2 zdania: co osiągniesz), "steps" – 4–12 ponumerowanych kroków w kolejności wykonywania (krótki tytuł + konkretny opis, co kliknąć/napisać/zrobić), "tips" – 0–4 krótkie wskazówki lub ostrzeżenia wynikające z materiału.',
  lekcja: 'Zrób krótką LEKCJĘ: "intro" (po co to umieć), "sections" – 3–6 sekcji z nagłówkiem i treścią (2–5 zdań, prosto, z przykładem z materiału jeśli jest), "questions" – 2–3 pytania sprawdzające z krótką odpowiedzią, "summary" – 1–3 zdania podsumowania.',
  prezentacja: 'Zrób PREZENTACJĘ: "subtitle" (1 zdanie), "slides" – 5–10 slajdów, każdy z tytułem, 2–5 krótkimi punktami (max ~12 słów każdy) i "note" – 1 zdanie notatki dla prowadzącej (może być pusta).',
  fiszki: 'Zrób FISZKI do nauki: "cards" – 6–14 par pytanie/odpowiedź. Pytanie krótkie, odpowiedź zwięzła (1–2 zdania). Każda fiszka o innej rzeczy.',
  test: 'Zrób TEST jednokrotnego wyboru: "questions" – 5–10 pytań, każde z 3–4 odpowiedziami w "options", "correct" = indeks poprawnej odpowiedzi (od 0), "explanation" – 1–2 zdania, dlaczego tak (na podstawie materiału). Rozkładaj poprawne odpowiedzi na różne pozycje, błędne odpowiedzi mają być wiarygodne, ale jednoznacznie błędne według materiału.',
};

function systemPrompt(kind, n) {
  return [
    'Jesteś pomocną nauczycielką, która robi materiały do nauki dla Magdy (nie jest programistką) z JEJ WŁASNYCH notatek o AI.',
    'ZASADY: 1) Korzystaj WYŁĄCZNIE z treści materiałów podanych przez użytkowniczkę. Nie dodawaj faktów, liczb, nazw ani kroków spoza nich. Jeśli czegoś brakuje – pomiń to, nie zgaduj.',
    '2) Pisz po polsku, prosto i ciepło, bez żargonu (trudne pojęcie wyjaśnij jednym zdaniem). Zwracaj się do niej w formie żeńskiej ("zrobisz", "nauczyłaś się").',
    n > 1 ? `3) Dostajesz ${n} materiały – połącz je w JEDNĄ logiczną całość w sensownej kolejności, usuń powtórzenia (to samo powiedziane dwa razy podaj raz).` : '3) Uporządkuj materiał logicznie i usuń powtórzenia.',
    '4) Tekst w polach jest zwykłym tekstem (bez Markdown, bez gwiazdek). "title" – krótki, chwytliwy tytuł.',
    KIND_RULES[kind],
    'Odpowiedz wyłącznie obiektem JSON zgodnym ze schematem.',
  ].join('\n');
}

// ---------- helpers ----------
// EXTRA_ORIGINS – tylko do testów lokalnych (.dev.vars), na produkcji puste.
let EXTRA = [];
const isAllowed = (origin) => ALLOWED_ORIGINS.includes(origin) || EXTRA.includes(origin);
function corsHeaders(origin) {
  const h = { 'Vary': 'Origin', 'Cache-Control': 'no-store' };
  if (isAllowed(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) } });
const fail = (status, code, message, origin, extra = {}) => json({ ok: false, code, message, ...extra }, status, origin);
const monthKey = () => 'spend:' + new Date().toISOString().slice(0, 7);
const budgetUsd = (env) => Number(env.MONTHLY_BUDGET_USD || '1.00');
async function getSpent(env) { return Number(await env.BUDGET.get(monthKey())) || 0; } // micro-dollars
function costMicro(model, usage) {
  const [pi, po] = PRICES[model] || [0.6, 2.4];
  return Math.ceil((usage.prompt_tokens || 0) * pi + (usage.completion_tokens || 0) * po); // tokens * $/1M = micro$
}

async function status(env, origin) {
  const spent = await getSpent(env), cap = budgetUsd(env) * 1e6;
  return json({ ok: true, model: env.MODEL, month: monthKey().slice(6), budget_usd: budgetUsd(env),
    spent_usd: +(spent / 1e6).toFixed(4), remaining_usd: +(Math.max(0, cap - spent) / 1e6).toFixed(4),
    rate_limit_per_hour: RATE_PER_HOUR, max_input_chars: MAX_INPUT_CHARS }, 200, origin);
}

async function generate(request, env, origin) {
  // 1) rate limit per IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `rl:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const used = Number(await env.BUDGET.get(rlKey)) || 0;
  if (used >= RATE_PER_HOUR) return fail(429, 'rate', 'Hola, hola! 🐌 Dużo dziś generujesz – odpocznij chwilkę i spróbuj za godzinkę.', origin);

  // 2) input
  let body;
  try { body = await request.json(); } catch { return fail(400, 'bad_json', 'Coś się pomieszało w wiadomości. Spróbuj jeszcze raz.', origin); }
  const kind = body?.kind;
  if (!KINDS.includes(kind)) return fail(400, 'bad_kind', 'Nie znam takiego rodzaju materiału.', origin);
  const sources = Array.isArray(body.sources) ? body.sources.slice(0, 12) : [];
  const clean = sources.map(s => ({ title: String(s?.title || '').slice(0, 300), source: String(s?.source || '').slice(0, 300), text: String(s?.text || '') }))
    .filter(s => s.text.trim() || s.title.trim());
  if (!clean.length) return fail(400, 'no_sources', 'Nie dostałam żadnej notatki do przerobienia.', origin);
  const total = clean.reduce((n, s) => n + s.text.length + s.title.length, 0);
  if (total > MAX_INPUT_CHARS) return fail(413, 'too_long', `To za dużo tekstu naraz (${total} znaków, limit ${MAX_INPUT_CHARS}). Zaznacz mniej karteczek.`, origin);

  // 3) monthly budget (pre-check with worst-case estimate)
  const model = env.MODEL || 'gpt-4.1-mini';
  const cap = budgetUsd(env) * 1e6, spent = await getSpent(env);
  const worst = costMicro(model, { prompt_tokens: Math.ceil(total / 2.5) + 900, completion_tokens: MAX_OUTPUT_TOKENS });
  if (spent + worst > cap) return fail(402, 'budget', 'Ups, w tym miesiącu skończył się budżet na generowanie 💸 Twoje notatki i wyszukiwarka działają dalej, a generowanie wróci 1. dnia nowego miesiąca.', origin);

  await env.BUDGET.put(rlKey, String(used + 1), { expirationTtl: 3700 });

  const userMsg = (body.title ? `Temat od Magdy: ${String(body.title).slice(0, 200)}\n\n` : '') +
    clean.map((s, i) => `### Materiał ${i + 1}: ${s.title}${s.source ? ` (źródło: ${s.source})` : ''}\n${s.text}`).join('\n\n');

  // 4) OpenAI
  let r;
  try {
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model, temperature: 0.4, max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'system', content: systemPrompt(kind, clean.length) }, { role: 'user', content: userMsg }],
        response_format: { type: 'json_schema', json_schema: { name: kind, strict: true, schema: SCHEMAS[kind] } },
      }),
    });
  } catch {
    return fail(502, 'upstream', 'Nie mogę się teraz dodzwonić do AI. Spróbuj za chwilkę.', origin);
  }
  const data = await r.json().catch(() => ({}));
  if (data?.usage) await env.BUDGET.put(monthKey(), String(spent + costMicro(model, data.usage)), { expirationTtl: 60 * 60 * 24 * 70 });
  if (!r.ok) {
    const c = data?.error?.code || data?.error?.type || '';
    console.log('openai error', r.status, c);
    if (c === 'insufficient_quota') return fail(402, 'quota', 'Na koncie OpenAI skończyły się środki 💸 Doładuj je, a generowanie od razu wróci.', origin);
    if (r.status === 401) return fail(502, 'key', 'Klucz do AI nie działa (może został zablokowany). Trzeba wstawić nowy.', origin);
    if (r.status === 429) return fail(503, 'busy', 'AI ma teraz kolejkę. Spróbuj za minutkę.', origin);
    return fail(502, 'upstream', 'AI coś nie wyszło. Spróbuj jeszcze raz.', origin);
  }
  const choice = data.choices?.[0];
  let out;
  try { out = JSON.parse(choice?.message?.content || ''); } catch { return fail(502, 'bad_output', choice?.finish_reason === 'length' ? 'Materiał wyszedł za długi i się uciął. Spróbuj z mniejszą liczbą karteczek.' : 'AI oddało coś dziwnego. Spróbuj jeszcze raz.', origin); }
  if (kind === 'test') for (const q of out.questions || []) q.correct = Math.max(0, Math.min((q.options?.length || 1) - 1, q.correct | 0));
  const after = spent + costMicro(model, data.usage || {});
  return json({ ok: true, kind, model, data: out, usage: { in: data.usage?.prompt_tokens, out: data.usage?.completion_tokens, cost_usd: +(costMicro(model, data.usage || {}) / 1e6).toFixed(5) },
    remaining_usd: +(Math.max(0, cap - after) / 1e6).toFixed(4) }, 200, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    EXTRA = String(env.EXTRA_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
    const allowed = isAllowed(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: corsHeaders(origin) });
    if (url.pathname === '/status' && request.method === 'GET') return status(env, origin);
    if (url.pathname === '/generate' && request.method === 'POST') {
      if (!allowed) return fail(403, 'origin', 'Ta furtka jest tylko dla aplikacji Baza wiedzy AI.', origin);
      if (!env.OPENAI_API_KEY) return fail(500, 'no_key', 'Brakuje klucza do AI.', origin);
      try { return await generate(request, env, origin); }
      catch (e) { console.log('err', e?.message); return fail(500, 'internal', 'Coś się zacięło po mojej stronie. Spróbuj jeszcze raz.', origin); }
    }
    return json({ ok: true, name: 'baza-wiedzy-ai proxy', endpoints: ['GET /status', 'POST /generate'] }, url.pathname === '/' ? 200 : 404, origin);
  },
};
