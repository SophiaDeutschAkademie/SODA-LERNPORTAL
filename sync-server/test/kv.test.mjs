// 학습 저장(/kv, SODA-LERNPORTAL/sync.js가 쓰는 부분) 시험. Cloudflare에 올리기 전에 이 폴더에서 실행합니다.
//   node test/kv.test.mjs            (Node 22 이상, python3과 cryptography 패키지 필요)
// worker.test.mjs와 같은 시험 서버(serve.mjs)와 시험용 학생 파일(gen-students.py)을 씁니다.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const W = process.argv[2] || path.join(HERE, '..', 'soda-sync.js');
const API = 'http://127.0.0.1:18797', SITE = 'http://127.0.0.1:18798';
const ORIGIN = SITE;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'soda-kv-test-'));
fs.mkdirSync(path.join(TMP, 'SODA-LERNPORTAL', 'data'), { recursive: true });
execFileSync('python3', ['-I', path.join(HERE, 'gen-students.py'), path.join(TMP, 'SODA-LERNPORTAL', 'data'), path.join(TMP, 'students.json')]);
const S = JSON.parse(fs.readFileSync(path.join(TMP, 'students.json')));
const srv = spawn('node', ['--no-warnings', path.join(HERE, 'serve.mjs'), W, TMP, '18797', '18798'], { stdio: ['ignore', 'pipe', 'inherit'] });
srv.on('exit', (c) => { if (c) { console.log('시험 서버가 끝났습니다(포트 사용 중?)'); process.exit(2); } });
await new Promise((r) => srv.stdout.once('data', r));

let pass = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name + '\n      ' + (e && e.stack || e)); process.exitCode = 1; } }
async function post(p, body, opt = {}) {
  const r = await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: opt.origin === undefined ? ORIGIN : opt.origin }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { st: r.status, j, h: r.headers };
}
const sql = async (q) => (await fetch(API + '/__ctl/sql?q=' + encodeURIComponent(q))).json();
const tok = async (s) => (await post('/token', { sid: s.sid, k: s.k })).j.tok;
const kv = (tk, body) => post('/kv', { tok: tk, now: Date.now(), since: 0, ...body });

const A = S[0], B = S[1];
const tA = await tok(A), tB = await tok(B);

await t('토큰 없거나 틀리면 401', async () => {
  assert.equal((await post('/kv', { now: Date.now(), since: 0 })).st, 401);
  assert.equal((await post('/kv', { tok: tA.slice(0, -2) + 'xx', now: Date.now(), since: 0 })).st, 401);
});
await t('허용하지 않은 출처는 403', async () => {
  assert.equal((await kv(tA, {})).st, 200);
  const r = await post('/kv', { tok: tA, now: Date.now(), since: 0 }, { origin: 'https://evil.example' });
  assert.equal(r.st, 403); assert.equal(r.h.get('access-control-allow-origin'), null);
});
await t('처음 받기: 비어 있음', async () => {
  const r = await kv(tA, {}); assert.equal(r.st, 200); assert.equal(r.j.ok, true); assert.equal(r.j.rev, 0); assert.deepEqual(r.j.items, []);
  assert.equal(r.h.get('access-control-allow-origin'), ORIGIN);
});
const t0 = Date.now();
await t('올리기: 방금 올린 값은 다시 받지 않음', async () => {
  const r = await kv(tA, { items: [{ k: 'uebung-lektion-03-v2', v: '{"a":"Ich lerne"}', t: t0 - 1000 }, { k: 'soda-xl|A2|01', v: '[1,2]', t: t0 - 500 }] });
  assert.equal(r.st, 200, JSON.stringify(r.j)); assert.equal(r.j.rev, 1); assert.deepEqual(r.j.items, []); assert.equal(r.j.rej, undefined);
});
await t('다른 기기: 처음부터 받기', async () => {
  const r = await kv(tA, {}); assert.equal(r.j.items.length, 2); assert.ok(r.j.items.every((i) => i.r === 1));
  const it = r.j.items.find((i) => i.k === 'uebung-lektion-03-v2'); assert.ok(Math.abs(it.t - (t0 - 1000)) < 2000);
});
await t('시계가 1시간 빠른 기기: 서버 시계로 맞춰 저장', async () => {
  const skew = 3600e3;
  const r = await post('/kv', { tok: tA, now: Date.now() + skew, since: 1, items: [{ k: 'uebung-lektion-03-v2', v: '{"a":"Ich lerne Deutsch"}', t: Date.now() + skew - 200 }] });
  assert.equal(r.j.rev, 2);
  const row = (await sql("select t from kv where k='uebung-lektion-03-v2'"))[0];
  assert.ok(Math.abs(row.t - Date.now()) < 3000, String(row.t - Date.now()));
});
await t('더 예전에 고친 값은 받지 않고 서버 값을 돌려줌', async () => {
  const r = await kv(tA, { since: 2, items: [{ k: 'uebung-lektion-03-v2', v: '{"a":"OLD"}', t: Date.now() - 60000 }] });
  assert.equal(r.j.rej.length, 1); assert.equal(r.j.rej[0].v, '{"a":"Ich lerne Deutsch"}');
  assert.equal((await sql("select v from kv where k='uebung-lektion-03-v2'"))[0].v, '{"a":"Ich lerne Deutsch"}');
});
await t('지우기(null)도 전달', async () => {
  const r = await kv(tA, { since: 3, items: [{ k: 'soda-xl|A2|01', v: null, t: Date.now() }] });
  const p = await kv(tA, { since: r.j.rev - 1 });
  assert.equal(p.j.items.length, 1); assert.equal(p.j.items[0].v, null);
});
await t('다른 학생과 섞이지 않음', async () => {
  const r = await kv(tB, {}); assert.equal(r.st, 200); assert.deepEqual(r.j.items, []);
});
await t('여러 쪽으로 나누어 받기(줄 수)', async () => {
  const many = []; for (let i = 0; i < 150; i++) many.push({ k: 'many-' + String(i).padStart(3, '0'), v: 'x'.repeat(100) + i, t: Date.now() });
  assert.equal((await kv(tB, { items: many })).st, 200);
  let got = [], since = 0, cur = '', pages = 0, r;
  do { r = await kv(tB, { since, cur }); got = got.concat(r.j.items); pages++; if (r.j.more) { since = r.j.next.since; cur = r.j.next.cur; } } while (r.j.more && pages < 20);
  assert.equal(got.length, 150); assert.equal(pages, 3); assert.equal(new Set(got.map((i) => i.k)).size, 150);
});
await t('여러 쪽으로 나누어 받기(크기)', async () => {
  const big = []; for (let i = 0; i < 6; i++) big.push({ k: 'big-' + i, v: 'y'.repeat(150000), t: Date.now() });
  await kv(tB, { items: big.slice(0, 3) }); const r0 = await kv(tB, { items: big.slice(3) });
  let got = [], since = r0.j.rev - 2, cur = '', pages = 0, r;
  do { r = await kv(tB, { since, cur }); got = got.concat(r.j.items); pages++; if (r.j.more) { since = r.j.next.since; cur = r.j.next.cur; } } while (r.j.more && pages < 20);
  assert.equal(got.length, 6); assert.ok(pages >= 2);
});
await t('너무 큰 값은 건너뛰고 알려 줌', async () => {
  const r = await kv(tB, { items: [{ k: 'huge', v: '가'.repeat(400000), t: Date.now() }, { k: 'small', v: 'ok', t: Date.now() }] });
  assert.deepEqual(r.j.skip, ['huge']);
  assert.equal((await sql("select count(*) n from kv where k in ('huge','small')"))[0].n, 1);
});
await t('한 번에 너무 많은 값은 413', async () => {
  const items = []; for (let i = 0; i < 201; i++) items.push({ k: 'x' + i, v: '1', t: Date.now() });
  assert.equal((await kv(tB, { items })).st, 413);
});
await t('형식이 틀린 값은 무시', async () => {
  const r = await kv(tA, { items: [{ k: 'num', v: 5, t: 1 }, { k: '', v: 'a' }, null, { k: 'dup', v: '1', t: Date.now() }, { k: 'dup', v: '2', t: Date.now() }] });
  assert.equal(r.st, 200);
  assert.equal((await sql("select v from kv where k='dup'"))[0].v, '2');
  assert.equal((await sql("select count(*) n from kv where k='num'"))[0].n, 0);
});
await t('VOKALAB 기록(/sync)과 섞이지 않음', async () => {
  await post('/sync', { tok: tA, app: 'vokalab', rev: 0, ch: [['voka-name', '"x"', Date.now()]] });
  const keys = (await kv(tA, {})).j.items.map((i) => i.k);
  assert.ok(keys.indexOf('voka-name') < 0);
  assert.equal((await sql("select count(*) n from rec where k='voka-name'"))[0].n, 1);
});
await t('요청당 D1 쿼리 수가 50개 이하', async () => {
  const c = await (await fetch(API + '/__ctl')).json();
  console.log('      (요청당 최대 쿼리 ' + c.maxQueries + '개)');
  assert.ok(c.maxQueries <= 50);
});

srv.kill();
fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n' + pass + '개 통과');
