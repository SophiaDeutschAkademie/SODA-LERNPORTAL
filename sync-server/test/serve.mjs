// 시험 서버: (1) Worker를 시험용 D1과 함께 돌리는 API 서버, (2) GitHub Pages처럼 사이트 폴더를 보여 주는 정적 서버
// 사용: node serve.mjs <worker.js> <사이트 폴더> <API 포트> <사이트 포트> [db 파일]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeD1 } from './d1.mjs';

const [workerPath, siteDir, apiPort, sitePort, dbFile] = process.argv.slice(2);
const worker = (await import(pathToFileURL(path.resolve(workerPath)).href + '?t=' + Date.now())).default;
const DB = makeD1(dbFile || ':memory:');
const env = {
  DB,
  PORTAL_DATA: `http://127.0.0.1:${sitePort}/SODA-LERNPORTAL/data/`,
  EXTRA_ORIGINS: `http://127.0.0.1:${sitePort},http://localhost:${sitePort}`
};
const ctl = { down: false, delay: 0, log: [], maxQueries: 0 };

http.createServer(async (req, res) => {
  // 시험 제어: /__ctl?down=1 (서버 끊김 흉내), /__ctl?delay=ms, /__ctl/log, /__ctl/sql
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__ctl') {
    if (u.searchParams.has('down')) ctl.down = u.searchParams.get('down') === '1';
    if (u.searchParams.has('delay')) ctl.delay = Number(u.searchParams.get('delay')) || 0;
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(ctl)); return;
  }
  if (u.pathname === '/__ctl/log') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(ctl.log)); ctl.log = []; return; }
  if (u.pathname === '/__ctl/sql') {
    const q = u.searchParams.get('q');
    try { const rows = DB._db.prepare(q).all(); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(rows)); }
    catch (e) { res.writeHead(400); res.end(String(e)); }
    return;
  }
  if (ctl.down) { req.socket.destroy(); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  if (ctl.delay) await new Promise((r) => setTimeout(r, ctl.delay));
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new Request(`http://127.0.0.1:${apiPort}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
  const before = DB._stats.queries;
  let response;
  try { response = await worker.fetch(request, env, { waitUntil() {} }); }
  catch (e) { console.error('worker threw', e); res.writeHead(500); res.end('worker threw'); return; }
  const used = DB._stats.queries - before;
  ctl.maxQueries = Math.max(ctl.maxQueries, used);
  const out = Buffer.from(await response.arrayBuffer());
  ctl.log.push({ m: req.method, p: u.pathname, st: response.status, inBytes: body.length, outBytes: out.length, q: used });
  const h = {};
  response.headers.forEach((v, k) => { h[k] = v; });
  res.writeHead(response.status, h);
  res.end(out);
}).listen(Number(apiPort), '127.0.0.1');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.bin': 'application/octet-stream' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(siteDir, p);
  if (!f.startsWith(path.resolve(siteDir))) { res.writeHead(403); res.end(); return; }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
}).listen(Number(sitePort), '127.0.0.1');

console.log(`api http://127.0.0.1:${apiPort}  site http://127.0.0.1:${sitePort}`);
