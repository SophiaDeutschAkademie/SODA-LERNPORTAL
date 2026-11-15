// 학습 기록 자동 저장 서버(soda-sync.js) 시험. Cloudflare에 올리기 전에 이 폴더에서 실행합니다.
//   node test/worker.test.mjs            (Node 22 이상, python3과 cryptography 패키지 필요)
// 시험용 D1(node:sqlite)과 시험용 학생 파일(임시 폴더)을 만들어 Worker를 실제 요청으로 시험합니다.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const W = process.argv[2] || path.join(HERE, '..', 'soda-sync.js');
const API = 'http://127.0.0.1:18787', SITE = 'http://127.0.0.1:18788';
const ORIGIN = SITE;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'soda-sync-test-'));
fs.mkdirSync(path.join(TMP, 'SODA-LERNPORTAL', 'data'), { recursive: true });
execFileSync('python3', ['-I', path.join(HERE, 'gen-students.py'), path.join(TMP, 'SODA-LERNPORTAL', 'data'), path.join(TMP, 'students.json')]);
const S = JSON.parse(fs.readFileSync(path.join(TMP, 'students.json')));
const srv = spawn('node', ['--no-warnings', path.join(HERE, 'serve.mjs'), W, TMP, '18787', '18788'], { stdio: ['ignore', 'pipe', 'inherit'] });
srv.on('exit', (c) => { if (c) { console.log('시험 서버가 끝났습니다(포트 사용 중?)'); process.exit(2); } });
await new Promise((r) => srv.stdout.once('data', r));

let pass = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name + '\n      ' + (e && e.stack || e)); process.exitCode = 1; } }
async function post(path, body, opt = {}) {
  const raw = typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body);
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: opt.origin === undefined ? ORIGIN : opt.origin }, body: raw });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { st: r.status, j, h: r.headers };
}
const ctl = async (q) => (await fetch(API + '/__ctl' + q)).json();

await t('상태 확인 GET /', async () => {
  const r = await fetch(API + '/'); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.ok, true); assert.equal(j.db, 'ok');
});
await t('사전 요청(OPTIONS): 허용한 출처', async () => {
  const r = await fetch(API + '/sync', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
});
await t('허용하지 않은 출처는 403', async () => {
  const r = await post('/token', { sid: S[0].sid, k: S[0].k }, { origin: 'https://evil.example' });
  assert.equal(r.st, 403); assert.equal(r.h.get('access-control-allow-origin'), null);
});

let tokA, tokB;
await t('토큰: 맞는 키', async () => {
  const r = await post('/token', { sid: S[0].sid, k: S[0].k });
  assert.equal(r.st, 200, JSON.stringify(r.j)); assert.match(r.j.tok, /^v1\.[0-9a-f]{20}\.[0-9a-z]+\.[A-Za-z0-9_-]{43}$/);
  assert.ok(r.j.exp > Date.now() + 12 * 3600e3); tokA = r.j.tok;
  assert.equal(r.h.get('access-control-allow-origin'), ORIGIN);
});
await t('토큰: 다른 학생의 키로는 401', async () => {
  const r = await post('/token', { sid: S[0].sid, k: S[1].k }); assert.equal(r.st, 401); assert.equal(r.j.error, 'key');
});
await t('토큰: 없는 학생 파일은 404', async () => {
  const r = await post('/token', { sid: 'aaaaaaaaaaaaaaaaaaaa', k: S[0].k }); assert.equal(r.st, 404);
});
await t('토큰: 형식이 틀리면 400', async () => {
  assert.equal((await post('/token', { sid: '../x', k: S[0].k })).st, 400);
  assert.equal((await post('/token', { sid: S[0].sid, k: 'abc' })).st, 400);
  assert.equal((await post('/token', 'not json')).st, 400);
});
await t('동기화: 토큰 없거나 위조면 401', async () => {
  assert.equal((await post('/sync', { tok: 'x', app: 'vokalab', rev: 0 })).st, 401);
  const bad = tokA.slice(0, -2) + (tokA.slice(-2) === 'AA' ? 'BB' : 'AA');
  assert.equal((await post('/sync', { tok: bad, app: 'vokalab', rev: 0 })).st, 401);
  const parts = tokA.split('.'); parts[1] = S[1].sid; // 다른 학생 id로 바꿔치기
  assert.equal((await post('/sync', { tok: parts.join('.'), app: 'vokalab', rev: 0 })).st, 401);
});
await t('동기화: 모르는 앱은 400', async () => {
  assert.equal((await post('/sync', { tok: tokA, app: 'other', rev: 0 })).st, 400);
});

let revA = 0;
await t('기기 A: 처음 올리기', async () => {
  const r = await post('/sync', { tok: tokA, app: 'vokalab', rev: 0, ch: [['voka-all-plan', '{"cur":0}', Date.now()], ['voka-all-w1-state', '{"m":1}', Date.now()], ['voka-name', '"홍길동"', Date.now()]] });
  assert.equal(r.st, 200, JSON.stringify(r.j)); assert.deepEqual(r.j.acc.sort(), ['voka-all-plan', 'voka-all-w1-state', 'voka-name']);
  assert.equal(r.j.rows.length, 0, '내가 방금 올린 기록은 다시 받지 않음'); assert.equal(r.j.rev, 1); revA = r.j.rev;
});
let revB = 0;
await t('기기 B: 처음 받기(같은 학생의 다른 토큰)', async () => {
  tokB = (await post('/token', { sid: S[0].sid, k: S[0].k })).j.tok;
  const r = await post('/sync', { tok: tokB, app: 'vokalab', rev: 0 });
  assert.equal(r.st, 200); assert.equal(r.j.rows.length, 3); assert.equal(r.j.more, 0); revB = r.j.rev;
  const m = Object.fromEntries(r.j.rows.map((x) => [x[0], x[1]])); assert.equal(m['voka-all-w1-state'], '{"m":1}');
});
await t('다른 학생에게는 보이지 않음', async () => {
  const tok2 = (await post('/token', { sid: S[1].sid, k: S[1].k })).j.tok;
  const r = await post('/sync', { tok: tok2, app: 'vokalab', rev: 0 }); assert.equal(r.j.rows.length, 0); assert.equal(r.j.rev, 0);
});
await t('기기 B가 바꾼 것을 기기 A가 받음', async () => {
  const r1 = await post('/sync', { tok: tokB, app: 'vokalab', rev: revB, ch: [['voka-all-w1-state', '{"m":2}', Date.now()]] });
  assert.deepEqual(r1.j.acc, ['voka-all-w1-state']); revB = r1.j.rev;
  const r2 = await post('/sync', { tok: tokA, app: 'vokalab', rev: revA });
  assert.deepEqual(r2.j.rows.map((x) => [x[0], x[1]]), [['voka-all-w1-state', '{"m":2}']]); revA = r2.j.rev; assert.equal(revA, revB);
});
await t('충돌: 오래된 rev로 보낸 기록은 덮어쓰지 않고 서버 기록을 돌려줌', async () => {
  const r1 = await post('/sync', { tok: tokB, app: 'vokalab', rev: revB, ch: [['voka-all-w1-state', '{"m":3}', Date.now()]] }); revB = r1.j.rev;
  const r2 = await post('/sync', { tok: tokA, app: 'vokalab', rev: revA, ch: [['voka-all-w1-state', '{"m":"A"}', Date.now()], ['voka-all-w2-state', '{"new":1}', Date.now()]] });
  assert.deepEqual(r2.j.acc, ['voka-all-w2-state'], '충돌 없는 기록만 저장');
  assert.deepEqual(r2.j.rows.map((x) => [x[0], x[1]]), [['voka-all-w1-state', '{"m":3}']], '충돌한 기록은 서버 쪽을 돌려줌');
  const again = await post('/sync', { tok: tokA, app: 'vokalab', rev: r2.j.rev, ch: [['voka-all-w1-state', '{"m":"merged"}', Date.now()]] });
  assert.deepEqual(again.j.acc, ['voka-all-w1-state'], '합친 뒤 새 rev로 보내면 저장'); revA = again.j.rev;
});
await t('지우기(null)도 전달', async () => {
  const r = await post('/sync', { tok: tokA, app: 'vokalab', rev: revA, ch: [['voka-all-w2-state', null, Date.now()]] }); revA = r.j.rev;
  const rb = await post('/sync', { tok: tokB, app: 'vokalab', rev: revB });
  const m = Object.fromEntries(rb.j.rows.map((x) => [x[0], x[1]])); assert.ok('voka-all-w2-state' in m); assert.equal(m['voka-all-w2-state'], null); revB = rb.j.rev;
});
await t('보관용(~) 기록은 받지 않음', async () => {
  const r = await post('/sync', { tok: tokA, app: 'vokalab', rev: revA, ch: [['~bak:1:voka-all-', '{"x":1}', Date.now()]] }); assert.deepEqual(r.j.acc, ['~bak:1:voka-all-']); revA = r.j.rev;
  const rb = await post('/sync', { tok: tokB, app: 'vokalab', rev: 0 }); assert.ok(!rb.j.rows.some((x) => x[0][0] === '~'));
  const db = await (await fetch(API + '/__ctl/sql?q=' + encodeURIComponent("select count(*) n from rec where k like '~%'"))).json(); assert.equal(db[0].n, 1);
});
await t('gzip 본문', async () => {
  const big = JSON.stringify({ log: Array.from({ length: 1500 }, (_, i) => ({ ts: 1731600000000 + i, type: 'study', msg: '학습 중 1/2 — der Sänger · 알아요' })) });
  const body = gzipSync(Buffer.from(JSON.stringify({ tok: tokA, app: 'vokalab', rev: revA, ch: [['voka-all-w1-log', big, Date.now()]] })));
  const r = await post('/sync', new Uint8Array(body)); assert.equal(r.st, 200, JSON.stringify(r.j)); assert.deepEqual(r.j.acc, ['voka-all-w1-log']); revA = r.j.rev;
  const rb = await post('/sync', { tok: tokB, app: 'vokalab', rev: revB }); const got = rb.j.rows.find((x) => x[0] === 'voka-all-w1-log'); assert.equal(got[1], big); revB = rb.j.rev;
});
await t('여러 쪽으로 나누어 받기(more/cur)', async () => {
  const tok2 = (await post('/token', { sid: S[1].sid, k: S[1].k })).j.tok;
  let rev = 0; const want = {};
  for (let w = 0; w < 3; w++) {
    const ch = [];
    for (let i = 0; i < 30; i++) { const k = `voka-b1n-w${w * 30 + i + 1}-log`, v = 'x'.repeat(40000) + k; want[k] = v; ch.push([k, v, Date.now()]); }
    const r = await post('/sync', { tok: tok2, app: 'vokalab', rev, ch }); assert.equal(r.st, 200, JSON.stringify(r.j)); assert.equal(r.j.acc.length, 30); rev = r.j.rev;
  }
  let got = {}, cur = undefined, pages = 0, last;
  do {
    const r = await post('/sync', { tok: (await post('/token', { sid: S[1].sid, k: S[1].k })).j.tok, app: 'vokalab', rev: 0, cur });
    r.j.rows.forEach((x) => { got[x[0]] = x[1]; }); cur = r.j.cur; pages++; last = r.j;
  } while (last.more);
  assert.ok(pages >= 3, 'pages=' + pages); assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort());
  for (const k in want) assert.equal(got[k], want[k]);
});
await t('한 번에 너무 많은 기록은 413', async () => {
  const ch = Array.from({ length: 37 }, (_, i) => ['voka-c1n-w' + i + '-state', '{}', Date.now()]);
  assert.equal((await post('/sync', { tok: tokA, app: 'vokalab', rev: revA, ch })).st, 413);
});
await t('서버 기록이 뒤처지면 reset', async () => {
  const r = await post('/sync', { tok: tokA, app: 'vokalab', rev: 99999 }); assert.equal(r.j.reset, 1);
});
await t('요청당 D1 쿼리 수가 50개 이하', async () => {
  const c = await ctl(''); assert.ok(c.maxQueries <= 50, 'max ' + c.maxQueries); console.log('      (요청당 최대 쿼리 ' + c.maxQueries + '개)');
});
await t('토큰 만료', async () => {
  // 만료 시각을 지난 토큰을 서명까지 맞게 만들 수는 없으므로, 만료 시각만 바꾼 토큰은 서명 불일치로 거부되는지 확인
  const p = tokA.split('.'); p[2] = (Date.now() - 1000).toString(36);
  assert.equal((await post('/sync', { tok: p.join('.'), app: 'vokalab', rev: 0 })).st, 401);
});

console.log(`\n${pass}개 통과` + (process.exitCode ? ' (실패 있음)' : ''));
srv.kill();
fs.rmSync(TMP, { recursive: true, force: true });
