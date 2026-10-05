import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { nanoid } from "nanoid";
import { env } from "@/env";

/**
 * Private file storage. Files are never public: pages link to them through
 * short-lived signed URLs. Uses Cloudinary (authenticated delivery type) when
 * configured, otherwise ./.data/uploads (local development).
 */

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");
const SIGNED_URL_SECONDS = 60 * 15;
// Keeps this app's files apart from anything else in a shared Cloudinary account.
const CLOUDINARY_ROOT = "linkpositively";
const DELIVERY_TYPE = "authenticated";

let cloudinaryReady = false;
function getCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return null;
  if (!cloudinaryReady) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    cloudinaryReady = true;
  }
  return cloudinary;
}

export const ALLOWED_UPLOAD_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  // Peer Navigation file sharing also accepted office documents.
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
} as const;

export const EXTENSION_TYPES = Object.fromEntries(
  Object.entries(ALLOWED_UPLOAD_TYPES).map(([type, ext]) => [ext, type]),
) as Record<string, UploadType>;
export type UploadType = keyof typeof ALLOWED_UPLOAD_TYPES;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function isAllowedUpload(type: string): type is UploadType {
  return type in ALLOWED_UPLOAD_TYPES;
}

/**
 * Where a storage key lives in Cloudinary. Images are image assets (public id
 * without the extension); everything else, PDFs included, is stored raw so
 * Cloudinary's PDF delivery restrictions don't apply.
 */
function cloudinaryAsset(key: string) {
  const ext = key.split(".").pop() ?? "";
  const isImage = EXTENSION_TYPES[ext]?.startsWith("image/") ?? false;
  const id = `${CLOUDINARY_ROOT}/${key}`;
  return isImage
    ? { publicId: id.slice(0, -(ext.length + 1)), format: ext, resourceType: "image" as const }
    : { publicId: id, format: "", resourceType: "raw" as const };
}

function cloudinaryDownloadUrl(key: string) {
  const asset = cloudinaryAsset(key);
  return getCloudinary()!.utils.private_download_url(asset.publicId, asset.format, {
    resource_type: asset.resourceType,
    type: DELIVERY_TYPE,
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_SECONDS,
  });
}

/** Stores a file and returns its storage key. */
export async function putFile(folder: string, data: Buffer, type: UploadType) {
  const key = `${folder}/${nanoid(21)}.${ALLOWED_UPLOAD_TYPES[type]}`;
  const client = getCloudinary();
  if (client) {
    const asset = cloudinaryAsset(key);
    await client.uploader.upload(`data:${type};base64,${data.toString("base64")}`, {
      public_id: asset.publicId,
      resource_type: asset.resourceType,
      type: DELIVERY_TYPE,
      overwrite: false,
    });
  } else {
    const file = path.join(LOCAL_ROOT, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  return key;
}

function localSignature(key: string, expires: number) {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(`${key}:${expires}`).digest("base64url");
}

/**
 * A URL that works for a few minutes. Callers must check access first.
 * Cloudinary download links can't carry a filename, so files that need one
 * are served through /api/files instead.
 */
export async function signedFileUrl(key: string, filename?: string) {
  if (getCloudinary() && !filename) return cloudinaryDownloadUrl(key);
  const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_SECONDS;
  const params = new URLSearchParams({ key, expires: String(expires), sig: localSignature(key, expires) });
  if (filename) params.set("name", filename);
  return `/api/files?${params}`;
}

export async function deleteFile(key: string) {
  const client = getCloudinary();
  if (client) {
    const asset = cloudinaryAsset(key);
    await client.uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType,
      type: DELIVERY_TYPE,
      invalidate: true,
    });
    return;
  }
  await rm(path.join(LOCAL_ROOT, key), { force: true });
}

/** Reads a stored file after checking its signed-URL parameters. */
export async function readSignedFile(params: URLSearchParams) {
  const key = params.get("key") ?? "";
  const expires = Number(params.get("expires"));
  const sig = params.get("sig") ?? "";
  if (!key || key.includes("..") || !Number.isFinite(expires) || expires < Date.now() / 1000) return null;
  const expected = Buffer.from(localSignature(key, expires));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    if (getCloudinary()) {
      const response = await fetch(cloudinaryDownloadUrl(key));
      if (!response.ok) return null;
      return { key, data: Buffer.from(await response.arrayBuffer()) };
    }
    return { key, data: await readFile(path.join(LOCAL_ROOT, key)) };
  } catch {
    return null;
  }
}
