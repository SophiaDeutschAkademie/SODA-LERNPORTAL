/* SODA 학습 기록 자동 저장 서버 (Cloudflare Worker, 이름: soda-sync)

   학습 포탈(SODA-LERNPORTAL)에 로그인한 학생이 학습 앱(지금은 VOKALAB)에서 공부한 기록을 저장하고,
   같은 학생이 다른 기기에서 로그인해 앱을 열면 그 기록을 내려 줍니다.

   Cloudflare 설정
   - D1 데이터베이스 하나를 이 Worker에 바인딩합니다. 변수 이름은 DB입니다. 표는 첫 요청 때 자동으로 만듭니다.
   - 그 밖의 설정은 필요 없습니다. 토큰 서명 키는 첫 요청 때 무작위로 만들어 D1(sys 표)에 보관합니다.
     비밀 변수 SYNC_SECRET을 넣으면 그 값을 대신 씁니다(바꾸면 발급한 토큰이 모두 무효가 되고, 앱이 새 토큰을 받습니다).

   요청 (본문은 JSON. 2KB가 넘으면 앱이 gzip으로 압축해 보냅니다)
   - GET  /        상태 확인 {ok, db}
   - POST /token   {sid, k}  학습 포탈 학생 파일(data/{sid}.bin)이 포탈 로그인 키 k로 열리는지 확인하고 저장 토큰을 줍니다.
   - POST /sync    {tok, app, rev, ch:[[키, 값 또는 null, 바꾼 시각]], cur}
                   바뀐 기록을 저장하고, 앱이 마지막으로 받은 번호(rev) 뒤에 다른 기기가 바꾼 기록을 돌려줍니다.
                   값이 null이면 지운 기록입니다. 다른 기기가 먼저 바꾼 기록은 덮어쓰지 않고 돌려주어 앱이 합치게 합니다.

   학생 확인 방법은 말하기 서버와 같습니다. 포탈 로그인 키로 그 학생의 암호화 파일이 실제로 열려야 토큰을 줍니다.
   키는 저장하지 않습니다. 토큰에는 학생 파일 id만 들어 있고 13시간 동안 씁니다.
   저장하는 것: 학생 파일 id, 앱 이름, 기록 키와 내용(앱이 브라우저에 저장하던 값 그대로), 시각. 이름과 비밀번호는 저장하지 않습니다. */

const PORTAL_DATA = 'https://sophiadeutschakademie.github.io/SODA-LERNPORTAL/data/';
const ORIGINS = ['https://sophiadeutschakademie.github.io'];
const APPS = ['vokalab'];
const TOKEN_TTL = 13 * 3600 * 1000;
const MAX_IN = 4 * 1024 * 1024;       // 받는 본문 최대 크기(압축을 푼 뒤)
const MAX_VAL = 1900000;              // 기록 하나의 최대 길이(D1 한 행 2MB 제한)
const MAX_CH = 36;                    // 한 번에 받는 기록 수(D1 무료 요금제의 요청당 쿼리 50개 제한 안쪽)
const PAGE_ROWS = 60, PAGE_CHARS = 500000; // 한 번에 돌려주는 양. 넘으면 more=1과 cur를 주어 이어 받게 함

const enc = new TextEncoder(), dec = new TextDecoder();
let schemaReady = null, hmacKey = null;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = allowOrigin(origin, env);
    const cors = allowed ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: allowed ? 204 : 403,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }
      });
    }
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'GET' && (path === '/' || path === '/health')) return json(await health(env), 200, cors);
      if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
      if (origin && !allowed) return json({ error: 'origin' }, 403, cors);
      if (!env.DB) return json({ error: 'nodb', message: 'D1 바인딩(DB)이 없습니다.' }, 500, cors);
      if (path !== '/token' && path !== '/sync') return json({ error: 'notfound' }, 404, cors);
      const body = await readBody(request);
      return path === '/token' ? await token(body, env, cors) : await sync(body, env, cors);
    } catch (e) {
      const status = (e && e.status) || 500;
      return json({ error: (e && e.code) || 'server', message: status === 500 ? '서버에서 처리하지 못했습니다.' : '' }, status, cors);
    }
  }
};

function allowOrigin(origin, env) {
  if (!origin) return false;
  if (ORIGINS.indexOf(origin) >= 0) return true;
  const extra = String((env && env.EXTRA_ORIGINS) || '').split(',').map(s => s.trim()).filter(Boolean); // 시험용. 보통은 비워 둡니다
  return extra.indexOf(origin) >= 0;
}
function json(o, status, cors) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
}
function fail(status, code) { const e = new Error(code); e.status = status; e.code = code; return e; }

/* 본문 읽기: gzip(1f 8b로 시작)이면 풀어서 읽습니다. 풀린 크기도 MAX_IN까지만 받습니다 */
async function readBody(request) {
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length > MAX_IN) throw fail(413, 'large');
  let bytes = raw;
  if (raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    const reader = new Response(raw).body.pipeThrough(new DecompressionStream('gzip')).getReader();
    const parts = []; let n = 0;
    for (;;) {
      let r;
      try { r = await reader.read(); } catch (e) { throw fail(400, 'gzip'); }
      if (r.done) break;
      n += r.value.length;
      if (n > MAX_IN) { try { reader.cancel(); } catch (e) {} throw fail(413, 'large'); }
      parts.push(r.value);
    }
    bytes = new Uint8Array(n); let o = 0;
    for (const p of parts) { bytes.set(p, o); o += p.length; }
  }
  try { return JSON.parse(dec.decode(bytes)) || {}; } catch (e) { throw fail(400, 'json'); }
}

async function health(env) {
  if (!env.DB) return { ok: false, service: 'soda-sync', db: 'missing' };
  try { await schema(env); return { ok: true, service: 'soda-sync', db: 'ok' }; }
  catch (e) { return { ok: false, service: 'soda-sync', db: 'error' }; }
}

function schema(env) {
  if (!schemaReady) {
    const DB = env.DB;
    schemaReady = DB.batch([
      DB.prepare('CREATE TABLE IF NOT EXISTS sys (k TEXT PRIMARY KEY, v TEXT NOT NULL)'),
      DB.prepare('CREATE TABLE IF NOT EXISTS head (sid TEXT NOT NULL, app TEXT NOT NULL, rev INTEGER NOT NULL, up INTEGER NOT NULL, PRIMARY KEY (sid, app))'),
      DB.prepare('CREATE TABLE IF NOT EXISTS rec (sid TEXT NOT NULL, app TEXT NOT NULL, k TEXT NOT NULL, v TEXT, t INTEGER NOT NULL, r INTEGER NOT NULL, up INTEGER NOT NULL, PRIMARY KEY (sid, app, k))'),
      DB.prepare('CREATE INDEX IF NOT EXISTS rec_r ON rec (sid, app, r, k)')
    ]).catch(e => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

/* ---------- 토큰 ---------- */
function b64u(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64uDec(t) { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function b64Dec(t) { const s = atob(t); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

async function signKey(env) {
  if (hmacKey) return hmacKey;
  let raw = env.SYNC_SECRET ? String(env.SYNC_SECRET) : '';
  if (!raw) {
    await schema(env);
    await env.DB.prepare("INSERT OR IGNORE INTO sys (k, v) VALUES ('secret', ?1)").bind(b64u(crypto.getRandomValues(new Uint8Array(32)))).run();
    raw = await env.DB.prepare("SELECT v FROM sys WHERE k = 'secret'").first('v');
    if (!raw) throw fail(500, 'secret');
  }
  hmacKey = await crypto.subtle.importKey('raw', enc.encode(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return hmacKey;
}
async function makeToken(sid, env) {
  const exp = Date.now() + TOKEN_TTL, p = 'v1.' + sid + '.' + exp.toString(36);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await signKey(env), enc.encode(p)));
  return { tok: p + '.' + b64u(sig), exp };
}
async function tokenSid(tok, env) {
  const m = /^v1\.([0-9a-f]{20})\.([0-9a-z]{1,12})\.([A-Za-z0-9_-]{43})$/.exec(String(tok || ''));
  if (!m || !(parseInt(m[2], 36) > Date.now())) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await signKey(env), b64uDec(m[3]), enc.encode('v1.' + m[1] + '.' + m[2])); } catch (e) { ok = false; }
  return ok ? m[1] : null;
}

/* 학습 포탈 학생 파일이 이 키로 열리는지 확인합니다. 'ok' | 'key'(맞지 않음) | 'nofile' | 'fetch' */
async function portalOpens(sid, k, env) {
  let res;
  try { res = await fetch((env.PORTAL_DATA || PORTAL_DATA) + sid + '.bin?v=' + Date.now().toString(36)); }
  catch (e) { return 'fetch'; }
  if (res.status === 404) return 'nofile';
  if (!res.ok) return 'fetch';
  const b = new Uint8Array(await res.arrayBuffer());
  if (b.length < 29) return 'key';
  try {
    const key = await crypto.subtle.importKey('raw', b64Dec(k), { name: 'AES-GCM' }, false, ['decrypt']);
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(16, 28), additionalData: enc.encode(sid) }, key, b.slice(28));
    return 'ok';
  } catch (e) { return 'key'; }
}

async function token(b, env, cors) {
  const sid = String((b && b.sid) || ''), k = String((b && b.k) || '');
  if (!/^[0-9a-f]{20}$/.test(sid) || !/^[A-Za-z0-9+/]{43}=$/.test(k)) return json({ error: 'input' }, 400, cors);
  const r = await portalOpens(sid, k, env);
  if (r === 'nofile') return json({ error: 'nofile' }, 404, cors);
  if (r === 'key') return json({ error: 'key' }, 401, cors);
  if (r !== 'ok') return json({ error: 'portal' }, 502, cors);
  return json(await makeToken(sid, env), 200, cors);
}

/* ---------- 기록 저장·불러오기 ---------- */
async function sync(b, env, cors) {
  const sid = await tokenSid(b.tok, env);
  if (!sid) return json({ error: 'token' }, 401, cors);
  const app = String(b.app || '');
  if (APPS.indexOf(app) < 0) return json({ error: 'app' }, 400, cors);
  let base = Number(b.rev);
  if (!Number.isSafeInteger(base) || base < 0) base = 0;
  const ch = Array.isArray(b.ch) ? b.ch : [];
  if (ch.length > MAX_CH) return json({ error: 'many' }, 413, cors);
  const now = Date.now(), seen = {}, list = [];
  for (let i = ch.length - 1; i >= 0; i--) { // 같은 키가 두 번 오면 뒤의 것
    const c = ch[i];
    if (!Array.isArray(c) || typeof c[0] !== 'string' || !c[0] || c[0].length > 200) return json({ error: 'input' }, 400, cors);
    if (c[1] !== null && typeof c[1] !== 'string') return json({ error: 'input' }, 400, cors);
    if (c[1] && c[1].length > MAX_VAL) return json({ error: 'large', k: c[0] }, 413, cors);
    if (seen[c[0]]) continue;
    seen[c[0]] = 1;
    let t = Number(c[2]);
    if (!Number.isFinite(t) || t < 0) t = now;
    list.push([c[0], c[1], Math.round(Math.min(t, now + 86400000))]);
  }
  await schema(env);
  const DB = env.DB;
  let rev = (await DB.prepare('SELECT rev FROM head WHERE sid = ?1 AND app = ?2').bind(sid, app).first('rev')) || 0;
  if (base > rev) return json({ reset: 1, rev, rows: [], acc: [], more: 0 }, 200, cors); // 서버 기록이 앱이 아는 것보다 뒤처짐(데이터베이스를 새로 만든 경우). 앱이 처음부터 다시 맞춥니다
  const acc = [];
  if (list.length) {
    const st = [DB.prepare('INSERT INTO head (sid, app, rev, up) VALUES (?1, ?2, 1, ?3) ON CONFLICT (sid, app) DO UPDATE SET rev = head.rev + 1, up = excluded.up').bind(sid, app, now)];
    for (const [k, v, t] of list) {
      st.push(DB.prepare('INSERT INTO rec (sid, app, k, v, t, r, up) VALUES (?1, ?2, ?3, ?4, ?5, (SELECT rev FROM head WHERE sid = ?1 AND app = ?2), ?6) ' +
        'ON CONFLICT (sid, app, k) DO UPDATE SET v = excluded.v, t = excluded.t, r = excluded.r, up = excluded.up WHERE rec.r <= ?7 RETURNING k').bind(sid, app, k, v, t, now, base));
    }
    st.push(DB.prepare('SELECT rev FROM head WHERE sid = ?1 AND app = ?2').bind(sid, app));
    const out = await DB.batch(st);
    for (let i = 1; i <= list.length; i++) { const rs = (out[i] && out[i].results) || []; if (rs.length) acc.push(rs[0].k); }
    rev = out[out.length - 1].results[0].rev;
  }
  // rev 뒤에 바뀐 기록(방금 저장한 것과 '~'로 시작하는 보관용 기록은 빼고). (r, k) 순서로 나누어 돌려줍니다
  let cr = base + 1, ck = '';
  if (Array.isArray(b.cur) && Number.isSafeInteger(Number(b.cur[0])) && typeof b.cur[1] === 'string') { cr = Number(b.cur[0]); ck = b.cur[1]; }
  const q = await DB.prepare("SELECT k, v, t, r FROM rec WHERE sid = ?1 AND app = ?2 AND (r > ?3 OR (r = ?3 AND k > ?4)) AND substr(k, 1, 1) <> '~' ORDER BY r, k LIMIT ?5")
    .bind(sid, app, cr, ck, PAGE_ROWS + 1).all();
  const found = q.results || [], rows = [], mine = {};
  acc.forEach(k => { mine[k] = 1; });
  let chars = 0, more = 0, cur = null;
  for (let i = 0; i < found.length; i++) {
    const x = found[i], len = x.v ? x.v.length : 0;
    if (i >= PAGE_ROWS || (rows.length && chars + len > PAGE_CHARS)) { more = 1; break; }
    cur = [x.r, x.k];
    if (mine[x.k] && x.r === rev) continue;
    rows.push([x.k, x.v, x.t, x.r]);
    chars += len;
  }
  return json({ rev, rows, acc, more, cur }, 200, cors);
}
