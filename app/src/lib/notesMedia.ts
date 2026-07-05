// Storage I/O for image (and later file) cards: uploads into the private
// notes-media bucket, client-side downscaling for canvas renditions, and
// signed-URL caching. Pure math lives in notesImages.ts.
//
// Path convention (matches the 0009 storage policies): every object key
// starts with the owner's user id — <uid>/<uuid>-orig.<ext> for originals,
// <uid>/<uuid>-thumb.jpg for the downscaled canvas rendition.

import { supabase } from './supabase';
import {
  extFromMime,
  IMAGE_MAX_RENDITION,
  needsDownscale,
} from './notesImages';

export type UploadedImage = {
  storagePath: string;
  thumbPath?: string;
  naturalW: number;
  naturalH: number;
};

const BUCKET = 'notes-media';

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not signed in.');
  return data.user.id;
}

/** Natural pixel dimensions of an image file. */
export async function readImageDims(file: Blob): Promise<{ w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const dims = { w: bitmap.width, h: bitmap.height };
  bitmap.close();
  return dims;
}

/**
 * Downscale to IMAGE_MAX_RENDITION on the longest edge, as JPEG. Returns
 * null when the source is small enough to use directly.
 */
export async function makeCanvasRendition(file: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  try {
    if (!needsDownscale(bitmap.width, bitmap.height)) return null;
    const scale = IMAGE_MAX_RENDITION / Math.max(bitmap.width, bitmap.height);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
    );
  } finally {
    bitmap.close();
  }
}

/**
 * Upload an image: original always; a downscaled canvas rendition when the
 * original exceeds the rendition cap. On any failure, cleans up whatever
 * it uploaded (no orphan objects).
 */
export async function uploadImage(file: File): Promise<UploadedImage> {
  const uid = await currentUserId();
  const stem = crypto.randomUUID();
  const origPath = `${uid}/${stem}-orig.${extFromMime(file.type)}`;
  const uploaded: string[] = [];
  try {
    const dims = await readImageDims(file);
    const { error: origErr } = await supabase.storage
      .from(BUCKET)
      .upload(origPath, file, { contentType: file.type, upsert: false });
    if (origErr) throw origErr;
    uploaded.push(origPath);

    let thumbPath: string | undefined;
    const rendition = await makeCanvasRendition(file);
    if (rendition) {
      thumbPath = `${uid}/${stem}-thumb.jpg`;
      const { error: thumbErr } = await supabase.storage
        .from(BUCKET)
        .upload(thumbPath, rendition, { contentType: 'image/jpeg', upsert: false });
      if (thumbErr) throw thumbErr;
      uploaded.push(thumbPath);
    }
    return { storagePath: origPath, thumbPath, naturalW: dims.w, naturalH: dims.h };
  } catch (err) {
    if (uploaded.length) await removeStorageObjects(uploaded).catch(() => {});
    throw err;
  }
}

export type UploadedFile = {
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

/** Upload a non-image file to the shared bucket (file cards). */
export async function uploadFile(file: File): Promise<UploadedFile> {
  const uid = await currentUserId();
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
  const path = `${uid}/${crypto.randomUUID()}-file.${ext || 'bin'}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  return {
    storagePath: path,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  };
}

/** Signed URL that triggers a download with the card's original filename. */
export async function signedDownloadUrl(path: string, filename: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGN_TTL_S, { download: filename });
  if (error || !data?.signedUrl) throw error ?? new Error('Could not sign URL');
  return data.signedUrl;
}

/** Delete storage objects (upload-failure cleanup; Sprint 18 uses it for permanent delete). */
export async function removeStorageObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}

// ── Signed URLs (private bucket) with a small in-memory cache ──────────
const SIGN_TTL_S = 3600;
const urlCache = new Map<string, { url: string; expiresAt: number }>();

export async function signedMediaUrl(path: string): Promise<string> {
  const hit = urlCache.get(path);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL_S);
  if (error || !data?.signedUrl) throw error ?? new Error('Could not sign URL');
  urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGN_TTL_S * 1000 });
  return data.signedUrl;
}
