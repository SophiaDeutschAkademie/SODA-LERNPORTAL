/* SODA 학습 저장(동기화) — https://sophiadeutschakademie.github.io/SODA-LERNPORTAL/sync.js
 *
 * 학습 포탈에 로그인한 학생이 학습 앱에서 푼 내용을 수시로 저장 서버(soda-sync Worker의 /kv)에 올리고,
 * 다른 기기에서 로그인하면 그 내용을 자동으로 불러옵니다. 서버 코드는 이 저장소의 sync-server/soda-sync.js입니다.
 *
 * - 학습 앱들은 푼 내용을 이 사이트의 localStorage에 저장합니다(앱마다 키 이름이 다름). 이 스크립트는 그 저장을 지켜보다가
 *   바뀐 값만 서버에 올리고, 서버에 다른 기기가 올린 값이 있으면 받아서 localStorage에 넣습니다. 앱 코드는 고치지 않습니다.
 * - 모든 학습 페이지의 <head> 맨 앞에서 불러옵니다. 챕터 본문처럼 같은 사이트의 iframe 안에서 불러오면 위 창에 알리기만 합니다.
 * - 포탈 로그인(localStorage 'soda-portal:session')이 있을 때만 서버와 주고받습니다. 로그인이 없을 때 바뀐 내용은 기억해 두었다가
 *   다음에 로그인하면 올립니다. 선생님 통과 로그인(t:1)은 저장하지 않습니다.
 * - 올리지 않는 값: 로그인 정보(soda-portal:*), 이 스크립트의 기록(soda-sync:*), 관리자 토큰, 화면 설정(다크 모드, 글씨 크기, 보기 방식,
 *   음성 설정, 페이지 위치), 저장 시험용 값, VOKALAB 기록(voka-*, VOKALAB이 따로 저장 서버의 /sync로 주고받음),
 *   Lehrwerk 목차 공지의 읽음 표시(soda-lehrwerk:notice). 목록은 아래 SKIP_EXACT, SKIP_PRE.
 * - 학생 확인은 저장 토큰(포탈이 로그인할 때 받아 두는 localStorage 'soda-portal:sync')으로 합니다. 없거나 끝났으면 포탈 로그인 키로 새로 받습니다.
 * - 같은 값을 두 기기에서 고치면 나중에 고친 쪽이 남습니다. 페이지를 열거나 다시 볼 때 서버에 더 새 값이 있으면,
 *   그 페이지가 읽은 값이 바뀐 경우에만 페이지를 한 번 새로 불러와 보여 줍니다(「다른 기기에서 저장한 내용을 불러왔습니다」).
 *   지금 이 페이지에서 고치고 있는 값은 이 페이지 쪽이 남습니다.
 * - 한 기기를 여러 학생이 쓰면, 다른 학생이 로그인할 때 앞 학생의 내용을 이 기기에서 치우고(서버에 못 올린 내용은 이 기기에 따로 보관)
 *   새 학생의 내용을 받아 옵니다. 이 기능을 처음 쓰는 기기에 전부터 있던 내용은 그 기기에서 처음 로그인한 학생의 것으로 봅니다.
 * - 서버에 연결하지 못해도 앱은 지금처럼 이 기기에 저장합니다. 연결되면 그때 올립니다.
 */
(function () {
  'use strict';
  var W = window, D = document;
  if (W.SodaSync) return;
  /* 챕터 본문처럼 srcdoc으로 만든 iframe은 주소가 about:srcdoc이라, 주소 대신 그 창의 출처(origin)로 봅니다 */
  var ORG = '';
  try { ORG = String(W.origin || location.origin || ''); } catch (e) { ORG = ''; }
  var LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ORG);
  if (!/^https:\/\//.test(ORG) && !LOCALHOST) return;

  /* 같은 사이트의 위 창에 이미 동기화가 있으면(챕터 본문 iframe 등) 이 창의 저장을 위 창에 알리기만 합니다 */
  var up = null;
  try { if (W.top !== W && W.top.SodaSync && W.top.SodaSync._install) up = W.top.SodaSync; } catch (e) { up = null; }
  if (up) { try { up._install(W); } catch (e) {} W.SodaSync = { frame: true }; return; }

  var LS;
  try { LS = W.localStorage; LS.getItem('soda-sync:s'); } catch (e) { return; }
  if (!W.JSON || !W.Storage || !W.fetch) return;
  var SP = W.Storage.prototype;
  var nGet = SP.getItem, nSet = SP.setItem, nKey = SP.key;

  var API = 'https://soda-sync.windschlaf.workers.dev';
  if (LOCALHOST && W.SODA_SYNC_API) API = String(W.SODA_SYNC_API).replace(/\/+$/, '');
  var SKEY = 'soda-portal:session', TKEY = 'soda-portal:sync';
  var KS = 'soda-sync:s', KH = 'soda-sync:h', KD = 'soda-sync:d';
  var MAXV = 1000000;        // 값 하나의 최대 크기(UTF-8). 서버와 같음
  var CHUNK = 250000;        // 요청 하나에 담는 값의 대략적인 크기
  var BEACON = 60000;        // 페이지를 닫을 때 보내는 요청의 최대 크기(브라우저 제한 64KB)
  var YIELD_MS = 3000;       // 페이지를 열거나 다시 볼 때, 서버 값을 받기 전에 앱이 스스로 쓴 값은 서버의 새 값에 양보합니다
  var ACTIVE_MS = 15000;     // 이 시간 안에 이 페이지가 고친 값은 "지금 고치는 중"으로 보고 이 페이지 쪽을 남깁니다
  var IDLE_MS = 60000;       // 이만큼 아무 조작이 없다가 다시 조작하면 서버를 한 번 확인합니다
  var PULL_MS = 120000;      // 화면을 보고 있는 동안 서버를 확인하는 간격
  var TICK_MS = 30000;
  var TLOG = null;
  function tlog(m) { if (!TLOG) return; TLOG.push(Date.now() % 100000 + ' ' + m); try { W.sessionStorage.setItem('soda-sync:tlog', (W.sessionStorage.getItem('soda-sync:tlog') || '') + '\n' + Date.now() % 100000 + ' ' + m); } catch (e) {} }
  if (LOCALHOST && W.SODA_SYNC_TEST) { /* 로컬 시험에서만 시간을 줄입니다 */
    TLOG = [];
    var T = W.SODA_SYNC_TEST;
    if (T.idle) IDLE_MS = T.idle; if (T.pull) PULL_MS = T.pull; if (T.tick) TICK_MS = T.tick; if (T.active) ACTIVE_MS = T.active;
  }

  var SKIP_EXACT = {
    'soda-theme': 1, 'soda-gk-theme': 1, 'uebung-fontscale': 1, 'zdz-fs': 1, 'soda-kurs-fs': 1, 'soda-schreib-scale': 1,
    'voka-tts-rate': 1, 'voka-tts-voice': 1, 'soda-gk-view': 1, 'sda-lehrwerk-grammatik-view': 1,
    'soda-gk-pg-hint': 1, 'soda-gk-pg-err': 1, 'sda-lehrwerk-grammatik-pg-hint': 1, 'sda-lehrwerk-grammatik-pg-err': 1,
    'soda-sprechen:pref': 1, 'soda-sprechen:t': 1, 'soda-gk-t': 1, 'sda-lehrwerk-grammatik-t': 1,
    'soda-kuerze-prefs-v1': 1, 'soda-diktat-hoerprobe': 1, 'skipgc': 1,
    'soda-lehrwerk:notice': 1 /* Lehrwerk 목차 공지의 읽음 표시: 학습 포탈 공지(soda-portal:notice)처럼 기기마다 따로 둡니다 */
  };
  var SKIP_PRE = ['soda-portal:', 'soda-sync:', 'ha-admin', 'sodabk', 'soda-gk-pos:', 'goatcounter', 'voka-'];
  function syncable(k) {
    if (typeof k !== 'string' || !k || k.length > 400 || SKIP_EXACT[k] === 1) return false;
    for (var i = 0; i < SKIP_PRE.length; i++) if (k.lastIndexOf(SKIP_PRE[i], 0) === 0) return false;
    return true;
  }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function now() { return Date.now(); }
  function jget(k) { try { return JSON.parse(nGet.call(LS, k) || 'null'); } catch (e) { return null; } }
  function jset(k, o) { try { nSet.call(LS, k, JSON.stringify(o)); return true; } catch (e) { return false; } }
  /* 값의 지문(cyrb53 + 길이). 값이 바뀌었는지만 봅니다 */
  function hash(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57, i, ch;
    for (i = 0; i < s.length; i++) { ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + '.' + s.length.toString(36);
  }
  function utf8len(s) {
    if (s.length * 3 <= MAXV) return s.length;
    try { return new TextEncoder().encode(s).length; } catch (e) { return s.length * 3; }
  }

  /* ───── 포탈 로그인과 이 기기의 동기화 상태 ───── */
  function sess() {
    var s = jget(SKEY);
    if (!s || s.v !== 1 || !s.sid || !s.k || !(s.exp > now()) || s.t) return null;
    return s;
  }
  function st() { var s = jget(KS); return s && s.v === 1 ? s : { v: 1, owner: null, rev: 0, cur: '' }; }
  function stSave(s) { jset(KS, s); }
  function loginTag(s) { return s.sid + '|' + s.at; }

  /* ───── 이 창(과 같은 사이트의 iframe)의 localStorage 읽기·쓰기 지켜보기 ───── */
  var reads = {}, wroteAt = {}, lastLocal = {}, pendingT = {}, extT = {}, touched = {}, frozen = {}, allFrozen = false, applying = 0;
  var yieldUntil = 0, pulledOnce = false, unloading = false, lastAct = now(), lastKey = 0, hiddenAt = 0, beaconAt = 0;
  var reloadPending = false, reloadByHook = false, frames = 0, startedFor = '', ownerAtStart = '';
  function noteRead(k) { k = String(k); if (syncable(k)) reads[k] = 1; }
  function wrote(k, v) {
    var t = now();
    if (TLOG) tlog('wrote ' + k + ' ' + String(v).slice(0, 40) + (t < yieldUntil ? ' (yield)' : ''));
    touched[k] = 1; lastLocal[k] = v;
    if (t < yieldUntil) pendingT[k] = 0; /* 페이지를 연 직후 앱이 스스로 쓴 값 */
    else { pendingT[k] = t; wroteAt[k] = t; lastAct = t; }
    schedule();
  }
  function frozenWrite(k) {
    tlog('frozen-write ' + (k || ''));
    /* 다른 기기의 새 내용으로 바뀐 값을 이 페이지가 예전 내용으로 다시 쓰려고 합니다. 쓰지 않고 바로 새로 불러옵니다 */
    if (!unloading && reloadPending && !D.hidden) setTimeout(doReload, 0);
  }
  /* 막아 둔 값인가. 이 페이지가 시험·녹음처럼 쓰는 중이면 막지 않고 이 페이지 쪽을 남깁니다(다른 학생 로그인은 언제나 막음) */
  function blocked(k) {
    if (allFrozen) { frozenWrite(k); return true; }
    if (frozen[k] !== 1) return false;
    if (!unloading && busyPage()) { delete frozen[k]; return false; }
    frozenWrite(k); return true;
  }
  function install(win) {
    var SPw, LSw;
    try { SPw = win.Storage.prototype; LSw = win.localStorage; } catch (e) { return false; }
    if (!SPw || SPw.__sodaSync === API) return true;
    var g = SPw.getItem, s = SPw.setItem, r = SPw.removeItem, c = SPw.clear;
    SPw.getItem = function (k) { if (this === LSw) noteRead(k); return g.apply(this, arguments); };
    SPw.setItem = function (k, v) {
      if (this === LSw && !applying) {
        var key = String(k);
        if (syncable(key)) { if (blocked(key)) return; wrote(key, String(v)); }
      }
      return s.apply(this, arguments);
    };
    SPw.removeItem = function (k) {
      if (this === LSw && !applying) {
        var key = String(k);
        if (syncable(key)) { if (blocked(key)) return; wrote(key, null); }
      }
      return r.apply(this, arguments);
    };
    SPw.clear = function () {
      if (this === LSw && !applying) {
        if (allFrozen) { frozenWrite(); return; }
        var t = now(); fullScan = true;
        allKeys().forEach(function (k) { pendingT[k] = t < yieldUntil ? 0 : t; if (t >= yieldUntil) wroteAt[k] = t; });
        schedule();
      }
      return c.apply(this, arguments);
    };
    try { Object.defineProperty(SPw, '__sodaSync', { value: API, configurable: true }); } catch (e) { SPw.__sodaSync = API; }
    if (win !== W) {
      frames++;
      if (reloadByHook) { reloadByHook = false; reloadPending = false; frozen = {}; }
    }
    return true;
  }
  install(W);

  /* 서버에서 받은 값 쓰기: 다른 저장 보조 스크립트(SODA GRAMMATIK의 autosave.js 등)도 알 수 있게 보통의 localStorage 동작으로 쓰고,
     이 스크립트는 자기 쓰기로 세지 않습니다(applying) */
  function writeLS(k, v) {
    applying++;
    try { if (v === null) LS.removeItem(k); else LS.setItem(k, v); return true; }
    catch (e) { return false; }
    finally { applying--; }
  }
  function allKeys() {
    var out = [], n, i, k;
    try { n = LS.length; } catch (e) { return out; }
    for (i = 0; i < n; i++) { k = nKey.call(LS, i); if (syncable(k)) out.push(k); }
    return out;
  }

  /* 바뀐 값 찾기. h: 서버와 맞춰 둔 값의 지문, d: 아직 서버에 올리지 않은 값 {키: [고친 시각, 지문(0이면 지움)]}
     고친 시각: 이 창에서 쓴 값은 쓴 시각, 다른 탭·창에서 쓴 값은 알림(storage 이벤트)을 받은 시각, 그 밖에는 발견한 시각.
     0 = 이 페이지를 열거나 다시 볼 때 서버를 확인하기 전에 이 페이지가 쓴 값(서버의 새 값에 양보), 1 = 이 기능 전부터 이 기기에 있던 값(서버 값과 합침) */
  function changedAt(k, t) { return has(pendingT, k) ? pendingT[k] : has(extT, k) ? extT[k] : t; }
  var fullScan = true;
  function scan(save, part) {
    var h = jget(KH) || {}, d = jget(KD) || {}, t = now(), ch = false, seen = {}, keys, i, k, v, hv, tt;
    if (part && !fullScan) {
      /* 이 창에서 쓴 키만 다시 봅니다(전체는 30초마다, 시작할 때) */
      keys = Object.keys(touched).filter(syncable); touched = {};
      for (i = 0; i < keys.length; i++) {
        k = keys[i];
        try { v = nGet.call(LS, k); } catch (e) { v = null; }
        hv = v === null ? 0 : hash(v);
        if (v === null && !has(h, k)) { if (d[k]) { delete d[k]; ch = true; } continue; }
        if (h[k] === hv || (v === null && !h[k])) { if (d[k]) { delete d[k]; ch = true; } continue; }
        if (d[k] && d[k][1] === hv) continue;
        tt = changedAt(k, t);
        d[k] = [tt, hv]; ch = true;
      }
      for (i = 0; i < keys.length; i++) { delete pendingT[keys[i]]; delete extT[keys[i]]; }
      if (ch && save !== false) jset(KD, d);
      return d;
    }
    fullScan = false; touched = {};
    keys = allKeys();
    for (i = 0; i < keys.length; i++) {
      k = keys[i]; seen[k] = 1;
      try { v = nGet.call(LS, k); } catch (e) { v = null; }
      if (v === null) continue;
      hv = hash(v);
      if (h[k] === hv) { if (d[k]) { delete d[k]; ch = true; } continue; }
      if (d[k] && d[k][1] === hv) continue;
      tt = changedAt(k, t);
      d[k] = [tt, hv]; ch = true;
    }
    for (k in h) if (has(h, k) && !seen[k] && syncable(k)) {
      if (d[k] && d[k][1] === 0) continue;
      tt = changedAt(k, t);
      d[k] = [tt, 0]; ch = true;
    }
    for (k in d) if (has(d, k) && !seen[k] && !has(h, k)) { delete d[k]; ch = true; }
    pendingT = {}; extT = {};
    if (ch && save !== false) jset(KD, d);
    return d;
  }

  /* ───── 서버 ───── */
  function call(path, body, keepalive) {
    var ctl = W.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
    var opt = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store' };
    if (keepalive) opt.keepalive = true;
    if (ctl) opt.signal = ctl.signal;
    return fetch(API + path, opt).then(function (r) {
      clearTimeout(to);
      return r.json().then(function (j) { j = j || {}; j._s = r.status; if (!j.code) j.code = j.error || ''; return j; }, function () { return { ok: false, code: 'http', _s: r.status }; });
    }, function () { clearTimeout(to); return { ok: false, code: 'net', _s: 0 }; });
  }
  /* 저장 토큰: 포탈이 로그인할 때 받아 둔 것을 쓰고, 없거나 끝났으면 포탈 로그인 키(k)로 서버의 /token에서 새로 받습니다 */
  function tokOf(s) { var c = jget(TKEY); return c && c.v === 1 && c.sid === s.sid && c.tok && c.exp > now() + 60000 ? c.tok : ''; }
  var tokP = null, tokFor = '', tokWait = null;
  function getTok(s, force) {
    var t = force ? '' : tokOf(s);
    if (t) return Promise.resolve({ tok: t });
    if (!force && tokWait) { /* 포탈이 로그인하면서 토큰을 받고 있으면 그것을 기다립니다 */
      var w = tokWait; tokWait = null;
      return w.then(function () { return getTok(s); }, function () { return getTok(s); });
    }
    if (!tokP || tokFor !== s.sid) {
      tokFor = s.sid;
      tokP = call('/token', { sid: s.sid, k: s.k }).then(function (r) {
        tokP = null;
        if (r && r.tok) {
          var z = sess();
          if (z && z.sid === s.sid) jset(TKEY, { v: 1, sid: s.sid, at: s.at, tok: r.tok, exp: r.exp });
          return { tok: r.tok };
        }
        return { fail: r };
      });
    }
    return tokP;
  }
  function req(s, body, keepalive) {
    function send(tk) {
      var b = { tok: tk, now: now() }, k;
      for (k in body) if (has(body, k)) b[k] = body[k];
      return call('/kv', b, keepalive);
    }
    if (keepalive) { var t = tokOf(s); return t ? send(t) : Promise.resolve({ ok: false, code: 'token', _s: 0 }); }
    return getTok(s).then(function (g) {
      if (!g.tok) return g.fail;
      return send(g.tok).then(function (r) {
        if (r._s !== 401) return r;
        return getTok(s, true).then(function (g2) { return g2.tok ? send(g2.tok) : g2.fail; }); /* 토큰이 끝났거나 서버 키가 바뀜 */
      });
    });
  }

  /* 이 기능을 쓰기 전부터 이 기기에 있던 값과 서버 값 합치기: 객체는 항목을 합치고, 같은 항목은 더 채워진 쪽(숫자는 큰 쪽, 참/거짓은 참)을 남깁니다 */
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function wt(v) {
    if (v === null || v === undefined || v === '' || v === false) return 0;
    if (typeof v === 'string') return 1 + v.length / 100000;
    if (typeof v !== 'object') return 1;
    var n = 0, k; for (k in v) if (has(v, k)) n += wt(v[k]); return n;
  }
  function mv(x, y) {
    var o, k;
    if (isObj(x) && isObj(y)) { o = {}; for (k in y) if (has(y, k)) o[k] = y[k]; for (k in x) if (has(x, k)) o[k] = has(y, k) ? mv(x[k], y[k]) : x[k]; return o; }
    if (Array.isArray(x) && Array.isArray(y)) { if (x.length === y.length) return x.map(function (v, i) { return mv(v, y[i]); }); return wt(x) > wt(y) ? x : y; }
    if (x === y) return x;
    if (typeof x === 'number' && typeof y === 'number') return Math.max(x, y);
    if (typeof x === 'boolean' && typeof y === 'boolean') return x || y;
    return wt(x) > wt(y) ? x : y;
  }
  function merge(a, b) {
    if (a === null) return b;
    if (b === null) return a;
    var A, B, M;
    try { A = JSON.parse(a); B = JSON.parse(b); } catch (e) { return wt(a) > wt(b) ? a : b; }
    M = JSON.stringify(mv(A, B));
    return M === JSON.stringify(B) ? b : M === JSON.stringify(A) ? a : M;
  }

  /* 서버에서 받은 값 넣기. phase1: 페이지를 열거나 다시 볼 때 처음 받는 값(이 페이지가 그 사이 스스로 쓴 값보다 서버 값이 먼저) */
  function apply(res, S) {
    var off = (res.now || now()) - now(), h = jget(KH) || {}, d = jget(KD) || {}, changed = [], list = (res.items || []).concat(res.rej || []);
    var i, it, k, hv, loc, cur, curH, tl, win, m, t = now();
    for (i = 0; i < list.length; i++) {
      it = list[i]; k = it.k;
      if (!syncable(k) || (it.v !== null && typeof it.v !== 'string')) continue;
      hv = it.v === null ? 0 : hash(it.v);
      try { cur = nGet.call(LS, k); } catch (e) { cur = null; }
      curH = cur === null ? 0 : hash(cur);
      loc = d[k];
      if (curH === hv) { if (hv) h[k] = hv; else delete h[k]; if (loc) delete d[k]; continue; }
      /* 맞춰 둔 값과 지금 값이 다르면, 아직 확인하지 않은 이 기기의 변경입니다(다른 탭에서 방금 고친 값 등) */
      if (!loc && curH !== (has(h, k) ? h[k] : 0)) loc = [changedAt(k, t), curH];
      /* 기록해 둔 변경 뒤에 또 바뀐 값(다른 탭에서 계속 고치는 중)도 지금 고친 것으로 봅니다 */
      else if (loc && loc[1] !== curH) {
        if (loc[0] === 1 && (!has(pendingT, k) || pendingT[k] === 0)) loc = [1, curH]; /* 이 기능 전부터 있던 값: 그대로 합칩니다 */
        else loc = [changedAt(k, t), curH];
      }
      tl = (+it.t || 0) - off;
      if (!loc) win = true;
      else if (loc[0] === 1) {
        m = merge(cur, it.v);
        if (m !== it.v) {
          if (writeLS(k, m)) { if (hv) h[k] = hv; else delete h[k]; d[k] = [t, m === null ? 0 : hash(m)]; if (reads[k]) changed.push(k); }
          continue;
        }
        win = true;
      } else if (loc[0] === 0) win = true;
      else win = tl >= loc[0];
      if (!win) continue;
      if (reads[k] && inUse(k)) { d[k] = [t, curH]; continue; } /* 지금 이 페이지에서 쓰고 있는 값: 이 페이지 쪽을 남깁니다 */
      if (!writeLS(k, it.v)) continue; /* 저장 공간이 모자람 */
      if (TLOG) tlog('apply ' + k + ' ' + String(it.v).slice(0, 40));
      if (hv) h[k] = hv; else delete h[k];
      delete d[k];
      if (reads[k]) changed.push(k);
    }
    jset(KH, h); jset(KD, d);
    if (res.more && res.next) { S.rev = res.next.since; S.cur = res.next.cur; } else { S.rev = res.rev; S.cur = ''; }
    stSave(S);
    if (changed.length) remoteChanged(changed);
    return changed;
  }

  function makeChunks(d) {
    var out = [], cur = [], size = 0, keys = Object.keys(d), i, k, v, n, t = now(), big = [];
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      try { v = nGet.call(LS, k); } catch (e) { v = null; }
      if (d[k][1] === 0) v = null;
      else if (v === null || hash(v) !== d[k][1]) continue; /* 그 사이 또 바뀜: 다음에 */
      n = v === null ? 0 : utf8len(v);
      if (n > MAXV) { big.push(k); continue; }
      if (cur.length && (size + n > CHUNK || cur.length >= 150)) { out.push(cur); cur = []; size = 0; }
      cur.push({ k: k, v: v, t: d[k][0] > 1 ? d[k][0] : t, _h: d[k][1] });
      size += n + k.length + 40;
    }
    if (cur.length) out.push(cur);
    out.big = big;
    return out;
  }
  function markSent(items) {
    var h = jget(KH) || {}, d = jget(KD) || {}, i, it;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it._h) h[it.k] = it._h; else delete h[it.k];
      if (d[it.k] && d[it.k][1] === it._h) delete d[it.k];
    }
    jset(KH, h); jset(KD, d);
  }
  function strip(items) { return items.map(function (it) { return { k: it.k, v: it.v, t: it.t }; }); }

  /* ───── 기기의 주인(학생) 바꾸기 ───── */
  var IDB = 'soda-sync';
  function idb() {
    return new Promise(function (ok) {
      try {
        var rq = W.indexedDB.open(IDB, 1);
        rq.onupgradeneeded = function () { try { rq.result.createObjectStore('park'); } catch (e) {} };
        rq.onsuccess = function () { ok(rq.result); };
        rq.onerror = rq.onblocked = function () { ok(null); };
      } catch (e) { ok(null); }
    });
  }
  function parkPut(sid, map) {
    if (!Object.keys(map).length) return Promise.resolve();
    return idb().then(function (db) {
      if (!db) return;
      return new Promise(function (ok) {
        try {
          var tx = db.transaction('park', 'readwrite'), os = tx.objectStore('park'), g = os.get(sid);
          g.onsuccess = function () {
            var old = g.result || {}, k;
            for (k in map) if (has(map, k) && (!old[k] || old[k][1] <= map[k][1] || map[k][1] === 1)) old[k] = map[k];
            os.put(old, sid);
          };
          tx.oncomplete = tx.onerror = tx.onabort = function () { try { db.close(); } catch (e) {} ok(); };
        } catch (e) { ok(); }
      });
    });
  }
  function parkTake(sid) {
    return idb().then(function (db) {
      if (!db) return null;
      return new Promise(function (ok) {
        var out = null;
        try {
          var tx = db.transaction('park', 'readwrite'), os = tx.objectStore('park'), g = os.get(sid);
          g.onsuccess = function () { out = g.result || null; if (out) os.delete(sid); };
          tx.oncomplete = tx.onerror = tx.onabort = function () { try { db.close(); } catch (e) {} ok(out); };
        } catch (e) { ok(null); }
      });
    });
  }
  /* SODA GRAMMATIK의 답안 복제본(autosave.js: sessionStorage, window.name, IndexedDB 'sodabk')도 앞 학생 것이므로 비웁니다 */
  function clearReplicas() {
    try { if (W.name && W.name.indexOf('SODABK:') === 0) W.name = ''; } catch (e) {}
    try { W.sessionStorage.removeItem('sodabk'); } catch (e) {}
    try {
      var rq = W.indexedDB.open('sodabk', 1);
      rq.onupgradeneeded = function () { try { rq.result.createObjectStore('kv'); } catch (e) {} };
      rq.onsuccess = function () { try { var db = rq.result, tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = tx.onerror = function () { db.close(); }; } catch (e) {} };
    } catch (e) {}
  }
  function switchOwner(from, to, all) {
    var d = scan(false), keys = allKeys(), park = {}, i, k, v;
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (!all && !d[k]) continue;
      try { v = nGet.call(LS, k); } catch (e) { v = null; }
      if (v !== null) park[k] = [v, all ? 1 : (d[k][0] > 1 ? d[k][0] : now())];
    }
    if (!all) for (k in d) if (has(d, k) && d[k][1] === 0) park[k] = [null, d[k][0] > 1 ? d[k][0] : now()];
    var saved = from ? parkPut(from, park) : Promise.resolve();
    for (i = 0; i < keys.length; i++) writeLS(keys[i], null);
    clearReplicas();
    jset(KH, {}); jset(KD, {});
    stSave({ v: 1, owner: to, rev: 0, cur: '' });
    return saved.then(function () { return parkTake(to); }).then(function (mine) {
      if (!mine) return;
      var dd = jget(KD) || {}, kk;
      for (kk in mine) if (has(mine, kk) && syncable(kk)) {
        if (mine[kk][0] === null) { writeLS(kk, null); continue; }
        if (writeLS(kk, mine[kk][0])) dd[kk] = [mine[kk][1], hash(mine[kk][0])];
      }
      jset(KD, dd);
    });
  }
  var ready = Promise.resolve();
  /* 로그인한 학생과 이 기기에 저장된 내용의 주인이 다르면 바꿉니다.
     이 기능을 처음 쓰는 기기는 이미 있던 내용을 로그인한 학생의 것으로 보고 서버 내용과 합칩니다(지금까지 그 기기에서 보던 내용이 그대로 남도록) */
  function ensureOwner(sid) {
    var S = st();
    if (S.owner === sid) return false;
    if (!S.owner) {
      var d = {}, keys = allKeys(), i, v;
      for (i = 0; i < keys.length; i++) { try { v = nGet.call(LS, keys[i]); } catch (e) { v = null; } if (v !== null) d[keys[i]] = [1, hash(v)]; }
      jset(KH, {}); jset(KD, d);
      stSave({ v: 1, owner: sid, rev: 0, cur: '', adopt: 1 });
      return false;
    }
    ready = switchOwner(S.owner, sid, false);
    return true;
  }
  /* 페이지가 이미 앞 학생의 내용을 읽은 뒤에 주인이 바뀌면, 그 내용으로 다시 쓰지 않게 막고 새로 불러옵니다 */
  function ownerChangedUnder() {
    if (!Object.keys(reads).length) return;
    allFrozen = true; reloadPending = true; tryReload();
  }

  /* ───── 주고받기 ───── */
  var busy = false, curP = null, queued = null, qWhy = '', timer = 0, firstDirty = 0, nextTry = 0, fails = 0, lastPull = 0;
  function emit() { try { W.dispatchEvent(new CustomEvent('soda-sync', { detail: status() })); } catch (e) {} }
  function withLock(fn) {
    var L = navigator.locks;
    if (!L || !L.request) return fn();
    var ctl = W.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 15000), ran = false;
    var opt = ctl ? { signal: ctl.signal } : {};
    return L.request('soda-sync', opt, function () { clearTimeout(to); ran = true; return fn(); })
      .catch(function (e) { clearTimeout(to); if (ran) throw e; return fn(); });
  }
  function fail(r, S, s) {
    if (r._s === 401 || (r._s === 404 && r.code === 'nofile')) { /* 학생 파일이 이 로그인 키로 열리지 않거나 없음(학생 파일이 다시 저장된 뒤의 예전 로그인 등) */
      S.auth = loginTag(s); S.err = r.code || 'auth'; stSave(S);
      authHint();
    } else {
      fails++; nextTry = now() + Math.min(300000, 5000 * Math.pow(2, Math.min(fails, 6)));
      S.err = r.code || ('http' + r._s); stSave(S);
    }
    emit();
    return false;
  }
  var authTold = false;
  /* 로그인 확인에 실패해 서버에 올리지 못하는 동안, 학습 앱 화면에서 10분에 한 번 알립니다 */
  function authHint() {
    if (authTold || location.pathname.indexOf('/SODA-LERNPORTAL/') >= 0) return;
    authTold = true;
    var told = 0; try { told = +W.sessionStorage.getItem('soda-sync:told') || 0; } catch (e) {}
    if (now() - told < 600000) return;
    try { W.sessionStorage.setItem('soda-sync:told', String(now())); } catch (e) {}
    toast('다른 기기와 이어 풀려면 학습 포탈에 다시 로그인해 주십시오.');
  }
  function run(s, why) {
    var S = st();
    if (S.owner !== s.sid) return Promise.resolve(false);
    var phase1 = !pulledOnce || !!S.adopt, guard = 0;
    function pull() {
      return req(s, { since: S.rev || 0, cur: S.cur || '' }).then(function (r) {
        if (!r.ok) return fail(r, S, s);
        S = st(); apply(r, S); lastPull = now();
        if (r.more && ++guard < 60) return pull();
        return true;
      });
    }
    function push() {
      var d = scan(true, true), ch = makeChunks(d), i = 0;
      if (ch.big.length) { S = st(); S.big = ch.big; stSave(S); }
      function next() {
        if (i >= ch.length) return Promise.resolve(true);
        var items = ch[i++];
        return req(s, { since: S.rev || 0, cur: S.cur || '', items: strip(items) }).then(function (r) {
          if (!r.ok) return fail(r, S, s);
          markSent(items);
          if (r.skip) { S = st(); S.big = (S.big || []).concat(r.skip); stSave(S); }
          S = st(); apply(r, S); lastPull = now();
          if (r.more) { guard = 0; return pull().then(function (ok) { return ok && next(); }); }
          return next();
        });
      }
      return next();
    }
    var p = phase1 ? pull().then(function (ok) {
      if (!ok) return false;
      pulledOnce = true; yieldUntil = 0;
      S = st(); if (S.adopt) { delete S.adopt; stSave(S); }
      return true;
    }) : Promise.resolve(true);
    return p.then(function (ok) {
      if (!ok) return false;
      var d = scan(true, true);
      if (Object.keys(d).length) return push();
      if (!phase1 && (why === 'pull' || why === 'force')) return pull();
      return true;
    }).then(function (ok) {
      if (ok) { S = st(); S.at = now(); delete S.err; if (S.auth) delete S.auth; stSave(S); fails = 0; nextTry = 0; emit(); }
      return ok;
    });
  }
  var RANK = { push: 1, pull: 1, start: 2, resume: 2, force: 3, login: 4 };
  function cycle(why) {
    var s = sess();
    if (!s) return Promise.resolve(false);
    if (busy) {
      /* 지금 주고받는 중이면 끝난 뒤에 한 번 더 합니다(여러 번 불려도 한 번) */
      if (!qWhy || (RANK[why] || 0) > (RANK[qWhy] || 0)) qWhy = why;
      if (!queued) queued = curP.then(function () { var w = qWhy; queued = null; qWhy = ''; return cycle(w); });
      return queued;
    }
    var S = st();
    if (S.auth === loginTag(s) && why !== 'login') { authHint(); return Promise.resolve(false); }
    if (why !== 'login' && why !== 'force' && now() < nextTry) return Promise.resolve(false);
    if (S.owner !== s.sid && ensureOwner(s.sid)) { pulledOnce = false; ownerAtStart = s.sid; ownerChangedUnder(); }
    busy = true; emit();
    curP = ready.then(function () { return withLock(function () { return run(s, why); }); })
      .catch(function () { return false; })
      .then(function (ok) { busy = false; emit(); return ok; });
    return curP;
  }
  function schedule(ms) {
    var t = now();
    if (!firstDirty) firstDirty = t;
    /* 고친 뒤 3초 동안 더 고치지 않으면 올리고, 계속 고치는 중이어도 20초마다 올립니다 */
    var wait = ms != null ? ms : Math.max(0, Math.min(3000, firstDirty + 20000 - t));
    clearTimeout(timer);
    timer = setTimeout(function () { firstDirty = 0; cycle('push'); }, wait);
  }
  /* 페이지를 닫거나 숨길 때: 아직 올리지 않은 값을 한 번에 보냅니다(응답은 기다리지 않음. 다음에 열 때 다시 확인합니다) */
  function beacon() {
    var s = sess(); if (!s || now() - beaconAt < 1500) return;
    beaconAt = now();
    var S = st(); if (S.owner !== s.sid || S.auth === loginTag(s)) return;
    var d = scan(), items = [], size = 0, k, v, n, t = now();
    for (k in d) if (has(d, k)) {
      if (d[k][0] <= 1 && !pulledOnce) continue; /* 서버를 아직 확인하지 않은 값은 보내지 않습니다 */
      try { v = d[k][1] === 0 ? null : nGet.call(LS, k); } catch (e) { continue; }
      if (v !== null && hash(v) !== d[k][1]) continue;
      n = (v === null ? 0 : v.length) + k.length + 40;
      if (size + n > BEACON) continue;
      items.push({ k: k, v: v, t: d[k][0] > 1 ? d[k][0] : t }); size += n;
    }
    if (items.length) req(s, { since: S.rev || 0, items: items }, true);
  }

  /* ───── 다른 기기의 새 내용으로 페이지 새로 불러오기 ───── */
  function playing() {
    var docs = [D], i, j, m;
    try { for (i = 0; i < W.frames.length; i++) { try { if (W.frames[i].document) docs.push(W.frames[i].document); } catch (e) {} } } catch (e) {}
    for (i = 0; i < docs.length; i++) {
      m = docs[i].querySelectorAll('audio,video');
      for (j = 0; j < m.length; j++) if (!m[j].paused && !m[j].ended) return true;
    }
    return false;
  }
  /* 이 페이지가 쓰는 중인가: 이 값을 방금 고쳤거나, 소리·영상을 재생 중이거나, 떠나기 전에 묻도록 해 둔 경우(시험·녹음 진행 중 등) */
  function busyPage() {
    var i;
    try { if (typeof W.onbeforeunload === 'function') return true; } catch (e) {}
    try { if (typeof W.SODA_SYNC_BUSY === 'function' && W.SODA_SYNC_BUSY()) return true; } catch (e) {}
    try { for (i = 0; i < W.frames.length; i++) { try { if (typeof W.frames[i].onbeforeunload === 'function') return true; } catch (e) {} } } catch (e) {}
    return playing();
  }
  function inUse(k) { return !!(wroteAt[k] && now() - wroteAt[k] < ACTIVE_MS) || busyPage(); }
  function remoteChanged(keys) {
    tlog('remote-changed ' + keys.join(','));
    for (var i = 0; i < keys.length; i++) frozen[keys[i]] = 1;
    reloadPending = true;
    tryReload();
  }
  var waitFocus = false;
  function tryReload() {
    if (!reloadPending || unloading || D.hidden) return;
    if (!allFrozen && !Object.keys(frozen).length) { reloadPending = false; return; }
    if (waitFocus && D.hasFocus && !D.hasFocus()) return;
    if (busyPage() || now() - lastKey < 3000) { setTimeout(tryReload, 2000); return; }
    doReload();
  }
  function doReload() {
    if (!reloadPending || unloading) return;
    /* 이 페이지가 쓰는 중이면(말하기 연습·녹음·재생 등) 지금 새로 불러오지 않고 끝날 때까지 기다립니다.
       예전에는 막아 둔 값을 페이지가 다시 쓰는 순간(frozenWrite) 여기로 바로 와서, 연습 도중에 페이지가 새로 불러와지고 연결이 끊겼습니다(2026-11-20). */
    if (busyPage()) { tlog('reload-wait-busy'); setTimeout(tryReload, 2000); return; }
    var log = [], t = now();
    try { log = JSON.parse(W.sessionStorage.getItem('soda-sync:rl') || '[]').filter(function (x) { return t - x < 60000; }); } catch (e) { log = []; }
    if (log.length >= 3) { tlog('reload-guard'); reloadPending = false; frozen = {}; allFrozen = false; return; } /* 너무 자주 새로 불러오면 멈춤 */
    log.push(t);
    try { W.sessionStorage.setItem('soda-sync:rl', JSON.stringify(log)); W.sessionStorage.setItem('soda-sync:toast', '1'); } catch (e) {}
    if (!allFrozen && typeof W.SODA_SYNC_RELOAD === 'function') {
      var done = false;
      try { done = W.SODA_SYNC_RELOAD() === true; } catch (e) { done = false; }
      if (done) {
        reloadByHook = true; reads = {};
        setTimeout(function () { if (reloadByHook) { reloadByHook = false; reloadPending = false; frozen = {}; } }, 8000);
        try { W.sessionStorage.removeItem('soda-sync:toast'); } catch (e) {}
        toast('다른 기기에서 저장한 내용을 불러왔습니다.');
        return;
      }
    }
    unloading = true;
    tlog('reload');
    location.reload();
  }
  function toast(msg) {
    function go() {
      var el = D.createElement('div');
      el.textContent = msg; el.setAttribute('role', 'status'); el.setAttribute('data-no-print', '');
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 32px);box-sizing:border-box;padding:10px 16px;border-radius:10px;background:rgba(46,58,85,.96);color:#fff;font:600 14px/1.45 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none;opacity:0;transition:opacity .25s;text-align:center;word-break:keep-all';
      D.body.appendChild(el);
      requestAnimationFrame(function () { el.style.opacity = '1'; });
      setTimeout(function () { el.style.opacity = '0'; setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400); }, 3600);
    }
    if (D.body) go(); else D.addEventListener('DOMContentLoaded', go);
  }

  /* ───── 다른 탭 · 다른 창의 변화 ───── */
  W.addEventListener('storage', function (e) {
    if (e.storageArea && e.storageArea !== LS) return;
    var k = e.key;
    if (k === null) { schedule(500); return; }
    if (k === SKEY) { onSess(); return; }
    if (k === KS) { var S = st(); if (ownerAtStart && S.owner && S.owner !== ownerAtStart) { ownerAtStart = S.owner; ownerChangedUnder(); } return; }
    if (!syncable(k)) return;
    touched[k] = 1;
    if (!(has(lastLocal, k) && lastLocal[k] === e.newValue)) extT[k] = now();
    if (has(lastLocal, k) && lastLocal[k] === e.newValue) return; /* 이 창의 iframe이 쓴 값 */
    /* 같은 기기의 다른 탭이 이 페이지가 읽은 값을 바꿨습니다. 예전 내용으로 다시 쓰지 않게 막고, 이 페이지로 돌아오면 새로 불러옵니다 */
    if (reads[k] && !inUse(k)) { tlog('freeze-by-event ' + k + ' ' + String(e.newValue).slice(0, 40)); frozen[k] = 1; reloadPending = true; waitFocus = true; tryReload(); }
    schedule(1500);
  });
  function onSess() {
    var s = sess();
    if (s && startedFor && s.sid !== startedFor) { startedFor = s.sid; ownerChangedUnder(); return; } /* 다른 학생이 로그인함 */
    if (s && !startedFor) { start(); return; }
    if (s) { pulledOnce = false; yieldUntil = now() + YIELD_MS; cycle('force'); }
    emit();
  }

  /* ───── 시작과 페이지 생명 주기 ───── */
  function start() {
    var s = sess();
    if (!s) return;
    startedFor = s.sid;
    if (ensureOwner(s.sid)) ownerChangedUnder();
    ownerAtStart = s.sid;
    yieldUntil = now() + YIELD_MS;
    cycle('start');
  }
  D.addEventListener('visibilitychange', function () {
    if (D.hidden) { hiddenAt = now(); beacon(); return; }
    beaconAt = 0;
    if (reloadPending) { tryReload(); return; }
    if (sess() && now() - hiddenAt > 10000) { pulledOnce = false; yieldUntil = now() + YIELD_MS; cycle('resume'); }
  });
  W.addEventListener('pagehide', function () { unloading = true; beacon(); });
  W.addEventListener('beforeunload', function () { beacon(); });
  W.addEventListener('pageshow', function (e) {
    unloading = false;
    if (e.persisted && sess()) { pulledOnce = false; yieldUntil = now() + YIELD_MS; cycle('resume'); }
  });
  W.addEventListener('online', function () { nextTry = 0; cycle('force'); });
  function activity(e) {
    var t = now();
    if (reloadPending && !unloading) { waitFocus = false; tryReload(); }
    if (e && e.type === 'keydown') lastKey = t;
    if (t - lastAct > IDLE_MS && sess() && !D.hidden) { lastAct = t; pulledOnce = false; yieldUntil = t + YIELD_MS; cycle('resume'); return; }
    lastAct = t;
  }
  W.addEventListener('keydown', activity, true);
  W.addEventListener('pointerdown', activity, true);
  W.addEventListener('focus', function () { activity(null); });
  setInterval(function () {
    if (D.hidden || !sess() || busy) return;
    fullScan = true;
    var d = scan();
    if (Object.keys(d).length) { schedule(0); return; }
    if (now() - lastPull > PULL_MS && now() - lastAct < 10 * 60000) cycle('pull');
  }, TICK_MS);
  try {
    if (W.sessionStorage.getItem('soda-sync:toast')) { W.sessionStorage.removeItem('soda-sync:toast'); toast('다른 기기에서 저장한 내용을 불러왔습니다.'); }
  } catch (e) {}

  /* ───── 포탈에서 쓰는 기능 ───── */
  function status() {
    var S = st(), s = sess(), d = jget(KD) || {};
    return { on: !!s, owner: S.owner || '', at: S.at || 0, pending: Object.keys(d).length, err: S.err || '', auth: !!(s && S.auth === loginTag(s)), busy: busy, big: (S.big || []).length };
  }
  function within(p, ms) { return Promise.race([p, new Promise(function (ok) { setTimeout(function () { ok(false); }, ms); })]); }
  W.SodaSync = {
    version: 1,
    api: API,
    status: status,
    /* 포탈이 새 로그인을 저장한 뒤 부릅니다: 이 기기의 주인을 맞추고 서버의 내용을 받아 온 뒤 남은 내용을 올립니다.
       tk: 포탈이 저장 토큰을 받는 중이면 그 Promise(따로 다시 받지 않도록) */
    login: function (ms, tk) {
      var s = sess(); if (!s) return Promise.resolve(status());
      startedFor = s.sid; nextTry = 0;
      if (tk && typeof tk.then === 'function') tokWait = tk;
      var S = st(); if (S.auth) { delete S.auth; delete S.err; stSave(S); }
      ensureOwner(s.sid); ownerAtStart = s.sid;
      pulledOnce = false; yieldUntil = 0; fullScan = true;
      return within(cycle('login'), ms || 8000).then(status);
    },
    /* 새 로그인을 저장하기 전에 부릅니다: 이 기기에 앞 학생의 내용이 있으면 치우고(올리지 못한 내용은 따로 보관) 새 학생의 보관분을 되살립니다 */
    prepare: function (sid) {
      if (!sid) return Promise.resolve();
      ensureOwner(sid); ownerAtStart = sid;
      return ready;
    },
    /* 지금까지 바뀐 내용을 바로 올립니다(로그아웃 전) */
    flush: function (ms) {
      if (!sess()) return Promise.resolve(status());
      nextTry = 0;
      return within(cycle('force'), ms || 3000).then(status);
    },
    /* 다른 학생이 이 기기에서 로그인하기 직전에, 앞 학생의 로그인으로 남은 내용을 올립니다 */
    flushFor: function (prev, ms) {
      if (!prev || prev.t || !prev.sid || !prev.k) return Promise.resolve(false);
      var S = st(); if (S.owner !== prev.sid || S.auth === loginTag(prev)) return Promise.resolve(false);
      if (!Object.keys(scan()).length) return Promise.resolve(true);
      return within(withLock(function () { pulledOnce = false; return run(prev, 'force'); }), ms || 4000);
    },
    _install: install,
    /* 이 스크립트가 지켜보지 않는 읽기(다른 저장 보조 스크립트가 내부 점검에 씀) */
    _get: function (k) { try { return nGet.call(LS, k); } catch (e) { return null; } }
  };
  if (LOCALHOST && W.SODA_SYNC_TEST) W.SodaSync._dbg = function () { return { log: TLOG, reads: reads, wroteAt: wroteAt, frozen: frozen, allFrozen: allFrozen, reloadPending: reloadPending, pulledOnce: pulledOnce, yieldUntil: yieldUntil, lastAct: lastAct, busy: busy, nextTry: nextTry, startedFor: startedFor, ownerAtStart: ownerAtStart, lastPull: lastPull }; };
  start();
})();
