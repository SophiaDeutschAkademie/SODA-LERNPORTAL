// 시험용 D1: Cloudflare D1 바인딩이 쓰는 부분(prepare/bind/first/all/run, batch)을 node:sqlite로 흉내 냅니다.
// batch는 D1처럼 하나의 트랜잭션으로 실행합니다. 쿼리 수를 세어 무료 요금제 제한(요청당 50개)을 넘는지 확인합니다.
import { DatabaseSync } from 'node:sqlite';

export function makeD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  const stats = { queries: 0 };
  const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  class Stmt {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...a) { return new Stmt(this.sql, a); }
    _exec() {
      stats.queries++;
      const st = db.prepare(this.sql);
      const reads = /^\s*(select|with)\b/i.test(this.sql) || /\breturning\b/i.test(this.sql);
      if (reads) return { results: st.all(...this.args.map(norm)).map((r) => ({ ...r })), success: true, meta: {} };
      const info = st.run(...this.args.map(norm));
      return { results: [], success: true, meta: { changes: info.changes } };
    }
    async first(col) { const r = this._exec().results[0]; if (!r) return null; if (col) { if (!(col in r)) throw new Error('no column ' + col); return r[col]; } return r; }
    async all() { return this._exec(); }
    async run() { return this._exec(); }
  }
  return {
    prepare: (sql) => new Stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((s) => s._exec()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    _db: db,
    _stats: stats
  };
}
