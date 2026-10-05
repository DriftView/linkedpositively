import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";
import { ALLOWED_UPLOAD_TYPES, isAllowedUpload, putFile } from "@/server/services/storage";
import { q, type Ctx } from "./context";

/**
 * Legacy uploads (Drupal `file_managed`) → private storage through the app's
 * storage service (Cloudinary, or ./.data/uploads locally). Storage keys are
 * random, so idempotency comes from the database: a row that already holds a
 * key keeps it and the file is not uploaded again.
 */

const LEGACY_ROOT = process.env.LEGACY_FILES_ROOT || path.resolve(process.cwd(), "..", "..", "link-positively-legacy-data");

export type LegacySite = "lp" | "peernav";

const SITE_DIR: Record<LegacySite, string> = { lp: "lp", peernav: "ecoach" };

export type ManagedFile = { fid: number; uri: string; filename: string; filemime: string; filesize: number; uid: number; timestamp: number };

const cache = new Map<string, Map<number, ManagedFile>>();

export async function managedFiles(ctx: Ctx, site: LegacySite) {
  let files = cache.get(site);
  if (!files) {
    const rows = await q<ManagedFile>(site === "lp" ? ctx.lp : ctx.pn, "select fid, uri, filename, filemime, filesize, uid, timestamp from file_managed");
    files = new Map(rows.map((row) => [Number(row.fid), row]));
    cache.set(site, files);
  }
  return files;
}

/** Local path of a Drupal `public://` / `private://` uri. */
export function legacyPath(site: LegacySite, uri: string) {
  const match = /^(public|private):\/\/(.+)$/.exec(uri);
  if (!match) return null;
  const base = path.join(LEGACY_ROOT, SITE_DIR[site], "sites", "default", match[1] === "public" ? "files" : "private");
  return path.join(base, ...match[2].split("/"));
}

/** True when a stored key is still present (local storage only; Cloudinary is trusted). */
export function storedKeyExists(key: string) {
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) return true;
  return existsSync(path.join(process.cwd(), ".data", "uploads", key));
}

export type Uploaded = { key: string; type: string };

/**
 * Uploads one legacy file and returns its new key, or null (skipped: missing
 * from the backup, type not allowed, or `--skip-files`). Reasons are counted
 * under `files` in the report.
 */
export async function uploadLegacyFile(ctx: Ctx, site: LegacySite, fid: number, folder: string): Promise<Uploaded | null> {
  const file = (await managedFiles(ctx, site)).get(fid);
  if (!file) {
    ctx.stats.skip("files", "file_managed row missing");
    return null;
  }
  ctx.stats.source("files", 1);
  if (ctx.opts.skipFiles || ctx.opts.dryRun) {
    ctx.stats.skip("files", ctx.opts.dryRun ? "dry run" : "--skip-files");
    return null;
  }
  const type = file.filemime === "image/jpg" ? "image/jpeg" : file.filemime;
  if (!isAllowedUpload(type)) {
    ctx.stats.skip("files", `type not allowed (${type})`);
    return null;
  }
  const local = legacyPath(site, file.uri);
  if (!local || !existsSync(local)) {
    ctx.stats.skip("files", `missing from backup (${file.uri.startsWith("private://") ? "private" : "public"})`);
    return null;
  }
  const data = await readFile(local);
  const key = await putFile(folder, data, type);
  ctx.stats.written("files", { inserted: 1, updated: 0, unchanged: 0 });
  return { key, type };
}

/** Uploads an in-memory buffer (e.g. a base64 image from legacy HTML). */
export async function uploadBuffer(ctx: Ctx, data: Buffer, type: string, folder: string): Promise<Uploaded | null> {
  ctx.stats.source("files", 1);
  if (ctx.opts.skipFiles || ctx.opts.dryRun) {
    ctx.stats.skip("files", ctx.opts.dryRun ? "dry run" : "--skip-files");
    return null;
  }
  if (!isAllowedUpload(type)) {
    ctx.stats.skip("files", `type not allowed (${type})`);
    return null;
  }
  const key = await putFile(folder, data, type);
  ctx.stats.written("files", { inserted: 1, updated: 0, unchanged: 0 });
  return { key, type };
}

/** Reuses `existing` when it is still stored, otherwise uploads the legacy file. */
export async function keepOrUpload(
  ctx: Ctx,
  existing: string | null | undefined,
  site: LegacySite,
  fid: number | null,
  folder: string,
): Promise<Uploaded | null> {
  if (existing && storedKeyExists(existing)) {
    ctx.stats.source("files", 1);
    ctx.stats.written("files", { inserted: 0, updated: 0, unchanged: 1 });
    const ext = existing.split(".").pop() ?? "";
    const type = Object.entries(ALLOWED_UPLOAD_TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
    return { key: existing, type };
  }
  if (!fid) return null;
  return uploadLegacyFile(ctx, site, fid, folder);
}
