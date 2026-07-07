// A small PostgREST-compatible query builder over PGlite — implements
// exactly the supabase-js surface this app uses (inventoried by grep, and
// pinned by test/localClient.test.ts):
//
//   .from(t).select(cols).eq/gt/gte/lt/lte/neq/.or(expr)
//           .order(col, {ascending}).limit(n).single()/.maybeSingle()
//   .from(t).insert(row | rows[]).select()?.single()?
//   .from(t).update(patch).eq(...).select()?.single()?
//   .from(t).delete().eq(...)
//
// Builders are thenable (`await q` → { data, error }) and NEVER throw —
// failures come back as { error }, matching supabase-js.
//
// Param typing: Postgres needs jsonb columns as JSON text and array columns
// as typed arrays. Column types are read once per table from
// information_schema and cached, then values are cast explicitly — so the
// same JS payloads the app already sends to Supabase work unchanged.

import type { PGlite } from '@electric-sql/pglite';

type ColumnTypes = Map<string, { udt: string; dataType: string }>;
const columnTypeCache = new Map<string, ColumnTypes>();

async function getColumnTypes(pg: PGlite, table: string): Promise<ColumnTypes> {
  const cached = columnTypeCache.get(table);
  if (cached) return cached;
  const res = await pg.query<{ column_name: string; data_type: string; udt_name: string }>(
    `select column_name, data_type, udt_name
       from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table],
  );
  const types: ColumnTypes = new Map();
  for (const row of res.rows) {
    types.set(row.column_name, { udt: row.udt_name, dataType: row.data_type });
  }
  columnTypeCache.set(table, types);
  return types;
}

/** Quote a plain SQL identifier (letters/digits/underscore only). */
function ident(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsupported identifier: ${name}`);
  }
  return `"${name}"`;
}

/** Column expression, supporting PostgREST json selectors a->b and a->>b. */
function colExpr(col: string): string {
  const m = col.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(->>?)([a-zA-Z0-9_]+)$/);
  if (m) return `${ident(m[1])}${m[2]}'${m[3]}'`;
  return ident(col);
}

const OPS: Record<string, string> = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
  like: 'like', ilike: 'ilike',
};

type Filter =
  | { kind: 'op'; col: string; op: string; value: unknown }
  | { kind: 'or'; expr: string };

type Order = { col: string; ascending: boolean };

export type LocalResult<T = unknown> = { data: T; error: { message: string; code?: string } | null };

export class LocalQueryBuilder implements PromiseLike<LocalResult<any>> {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private columns = '*';
  private values: Record<string, unknown> | Array<Record<string, unknown>> | null = null;
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private wantRows = true;          // false for write ops without .select()
  private singleMode: 'single' | 'maybe' | null = null;

  constructor(
    private readonly ready: Promise<PGlite>,
    private readonly table: string,
  ) {}

  select(cols = '*'): this {
    this.columns = cols;
    if (this.action !== 'select') this.wantRows = true;
    return this;
  }
  insert(v: Record<string, unknown> | Array<Record<string, unknown>>): this {
    this.action = 'insert';
    this.values = v;
    this.wantRows = false; // until .select() is chained, like supabase-js
    return this;
  }
  update(v: Record<string, unknown>): this {
    this.action = 'update';
    this.values = v;
    this.wantRows = false;
    return this;
  }
  delete(): this {
    this.action = 'delete';
    this.wantRows = false;
    return this;
  }

  eq(col: string, value: unknown): this { return this.op('eq', col, value); }
  neq(col: string, value: unknown): this { return this.op('neq', col, value); }
  gt(col: string, value: unknown): this { return this.op('gt', col, value); }
  gte(col: string, value: unknown): this { return this.op('gte', col, value); }
  lt(col: string, value: unknown): this { return this.op('lt', col, value); }
  lte(col: string, value: unknown): this { return this.op('lte', col, value); }
  private op(op: string, col: string, value: unknown): this {
    this.filters.push({ kind: 'op', col, op, value });
    return this;
  }
  /** PostgREST .or() — comma-separated `col.op.value` clauses, OR-ed together
   *  and AND-ed with the other filters. Values are treated as text. */
  or(expr: string): this {
    this.filters.push({ kind: 'or', expr });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, ascending: opts?.ascending !== false });
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  single(): this { this.singleMode = 'single'; return this; }
  maybeSingle(): this { this.singleMode = 'maybe'; return this; }

  then<R1 = LocalResult, R2 = never>(
    onfulfilled?: ((value: LocalResult<any>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  // ── Execution ─────────────────────────────────────────────────────────

  private async run(): Promise<LocalResult<any>> {
    try {
      const pg = await this.ready;
      const types = await getColumnTypes(pg, this.table);
      const { sql, params } = this.toSql(types);
      const res = await pg.query<Record<string, unknown>>(sql, params);
      const rows = res.rows ?? [];
      let data: unknown = this.wantRows ? rows : null;
      if (this.singleMode) {
        if (rows.length === 1) data = rows[0];
        else if (rows.length === 0 && this.singleMode === 'maybe') data = null;
        else {
          return {
            data: null,
            error: {
              code: 'PGRST116',
              message: `JSON object requested, ${rows.length} rows returned`,
            },
          };
        }
      }
      return { data, error: null };
    } catch (err) {
      const e = err as { message?: string; code?: string };
      return { data: null, error: { message: e?.message ?? String(err), code: e?.code } };
    }
  }

  /** Cast a JS value for a column, based on its Postgres type. Returns the
   *  param value and the SQL placeholder expression (with cast if needed). */
  private castValue(
    col: string,
    value: unknown,
    types: ColumnTypes,
    params: unknown[],
  ): string {
    const t = types.get(col);
    params.push(prepareParam(value, t?.udt));
    const idx = params.length;
    if (t?.udt === 'jsonb') return `$${idx}::jsonb`;
    if (t?.udt === 'json') return `$${idx}::json`;
    if (t?.dataType === 'ARRAY') return `$${idx}::${t.udt.replace(/^_/, '')}[]`;
    if (t?.udt === 'uuid') return `$${idx}::uuid`;
    return `$${idx}`;
  }

  private whereSql(types: ColumnTypes, params: unknown[]): string {
    if (this.filters.length === 0) return '';
    const parts = this.filters.map((f) => {
      if (f.kind === 'op') {
        if (f.value === null && f.op === 'eq') return `${colExpr(f.col)} is null`;
        const sqlOp = OPS[f.op];
        if (!sqlOp) throw new Error(`Unsupported operator: ${f.op}`);
        // JSON selectors compare as text; plain columns get typed casts.
        const isJsonSel = /->/.test(f.col);
        if (isJsonSel) {
          params.push(String(f.value));
          return `${colExpr(f.col)} ${sqlOp} $${params.length}`;
        }
        return `${colExpr(f.col)} ${sqlOp} ${this.castValue(f.col, f.value, types, params)}`;
      }
      // .or(): parse `col.op.value` clauses; value may itself contain dots
      // (e.g. storage paths), so split on the first `.op.` token only.
      const clauses = f.expr.split(',').map((clause) => {
        const m = clause.match(/^(.+?)\.(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.*)$/);
        if (!m) throw new Error(`Unsupported or() clause: ${clause}`);
        const [, col, op, raw] = m;
        if (op === 'is' && raw === 'null') return `${colExpr(col)} is null`;
        params.push(raw);
        return `${colExpr(col)} ${OPS[op]} $${params.length}`;
      });
      return `(${clauses.join(' or ')})`;
    });
    return ` where ${parts.join(' and ')}`;
  }

  private toSql(types: ColumnTypes): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const table = ident(this.table);
    const selectList =
      this.columns.trim() === '*'
        ? '*'
        : this.columns.split(',').map((c) => colExpr(c.trim())).join(', ');

    if (this.action === 'select') {
      let sql = `select ${selectList} from ${table}`;
      sql += this.whereSql(types, params);
      if (this.orders.length > 0) {
        sql += ' order by ' + this.orders
          .map((o) => `${colExpr(o.col)} ${o.ascending ? 'asc' : 'desc'}`)
          .join(', ');
      }
      if (this.limitN !== null) sql += ` limit ${Math.max(0, Math.floor(this.limitN))}`;
      return { sql, params };
    }

    if (this.action === 'insert') {
      const rows = Array.isArray(this.values) ? this.values : [this.values!];
      if (rows.length === 0) return { sql: 'select 1 where false', params };
      const cols = Object.keys(rows[0]);
      const tuples = rows.map(
        (row) => `(${cols.map((c) => this.castValue(c, row[c], types, params)).join(', ')})`,
      );
      const sql =
        `insert into ${table} (${cols.map(ident).join(', ')}) values ${tuples.join(', ')}` +
        ` returning ${selectList}`;
      return { sql, params };
    }

    if (this.action === 'update') {
      const patch = this.values as Record<string, unknown>;
      const sets = Object.keys(patch).map(
        (c) => `${ident(c)} = ${this.castValue(c, patch[c], types, params)}`,
      );
      let sql = `update ${table} set ${sets.join(', ')}`;
      sql += this.whereSql(types, params);
      sql += ` returning ${selectList}`;
      return { sql, params };
    }

    // delete
    let sql = `delete from ${table}`;
    sql += this.whereSql(types, params);
    sql += ` returning ${selectList}`;
    return { sql, params };
  }
}

/** Serialize a JS value the way the column type expects. */
function prepareParam(value: unknown, udt: string | undefined): unknown {
  if (value === undefined) return null;
  if (udt === 'jsonb' || udt === 'json') {
    return value === null ? null : JSON.stringify(value);
  }
  return value;
}
