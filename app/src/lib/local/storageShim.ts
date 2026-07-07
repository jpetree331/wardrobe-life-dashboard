// Storage shim for local/desktop mode: media bytes live in the `local_files`
// table inside the same PGlite database as everything else — one file holds
// the friend's whole Wardrobe. Implements the three storage methods the app
// uses: upload, createSignedUrl, remove. "Signed URLs" become object URLs
// minted from the stored bytes (cached per path so repeated renders reuse
// them instead of leaking).

import type { PGlite } from '@electric-sql/pglite';

const urlCache = new Map<string, string>();

export function createStorageShim(ready: Promise<PGlite>) {
  return {
    from(bucket: string) {
      return {
        async upload(
          path: string,
          file: Blob | ArrayBuffer | Uint8Array,
          opts?: { contentType?: string; upsert?: boolean },
        ) {
          try {
            const pg = await ready;
            const bytes =
              file instanceof Uint8Array
                ? file
                : file instanceof ArrayBuffer
                  ? new Uint8Array(file)
                  : new Uint8Array(await (file as Blob).arrayBuffer());
            const mime =
              opts?.contentType ?? (file instanceof Blob ? file.type : 'application/octet-stream');
            if (opts?.upsert) {
              await pg.query(
                `insert into local_files (path, bucket, mime, bytes) values ($1, $2, $3, $4)
                 on conflict (path) do update set bucket = $2, mime = $3, bytes = $4`,
                [path, bucket, mime, bytes],
              );
            } else {
              await pg.query(
                'insert into local_files (path, bucket, mime, bytes) values ($1, $2, $3, $4)',
                [path, bucket, mime, bytes],
              );
            }
            // Invalidate any cached URL for a replaced object.
            const cached = urlCache.get(path);
            if (cached) {
              URL.revokeObjectURL(cached);
              urlCache.delete(path);
            }
            return { data: { path }, error: null };
          } catch (err) {
            const e = err as { message?: string };
            return { data: null, error: { message: e?.message ?? String(err) } };
          }
        },

        async createSignedUrl(path: string, _expiresIn: number, _opts?: { download?: string }) {
          try {
            const cached = urlCache.get(path);
            if (cached) return { data: { signedUrl: cached }, error: null };
            const pg = await ready;
            const res = await pg.query<{ mime: string | null; bytes: Uint8Array }>(
              'select mime, bytes from local_files where path = $1 and bucket = $2',
              [path, bucket],
            );
            const row = res.rows[0];
            if (!row) return { data: null, error: { message: 'Object not found' } };
            const blob = new Blob([toUint8(row.bytes) as BlobPart], {
              type: row.mime ?? 'application/octet-stream',
            });
            const url = URL.createObjectURL(blob);
            urlCache.set(path, url);
            return { data: { signedUrl: url }, error: null };
          } catch (err) {
            const e = err as { message?: string };
            return { data: null, error: { message: e?.message ?? String(err) } };
          }
        },

        async remove(paths: string[]) {
          try {
            const pg = await ready;
            await pg.query(
              'delete from local_files where bucket = $1 and path = any($2::text[])',
              [bucket, paths],
            );
            for (const p of paths) {
              const cached = urlCache.get(p);
              if (cached) {
                URL.revokeObjectURL(cached);
                urlCache.delete(p);
              }
            }
            return { data: [], error: null };
          } catch (err) {
            const e = err as { message?: string };
            return { data: null, error: { message: e?.message ?? String(err) } };
          }
        },
      };
    },
  };
}

/** PGlite may hand bytea back in a few shapes; normalize to Uint8Array. */
function toUint8(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (typeof v === 'string' && v.startsWith('\\x')) {
    const hex = v.slice(2);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  throw new Error('Unexpected bytea representation');
}
