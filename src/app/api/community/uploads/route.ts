import { NextResponse } from "next/server";
import { can, getViewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { communityUploads } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { MAX_UPLOAD_BYTES, putFile } from "@/server/services/storage";
import type { UploadDTO } from "@/features/community/types";

/**
 * Photo upload for the post and comment composers (multipart field "file",
 * optional "width"/"height" measured in the browser). The file is stored
 * privately and becomes part of a post only when the post action claims it.
 */

type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** Checks the file's magic bytes, so a renamed file can't pass as an image. */
function sniff(buffer: Buffer): ImageType | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

function dimension(value: FormDataEntryValue | null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number < 20_000 ? Math.round(number) : undefined;
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "community.post")) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  // Reject oversized bodies before buffering them (the form parser reads everything).
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "That photo is too big. Please choose one under 8 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "That upload didn't come through. Please try again." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That photo is too big. Please choose one under 8 MB." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const type = sniff(buffer);
  if (!type) {
    return NextResponse.json({ error: "Photos can be JPG, PNG, GIF or WebP." }, { status: 415 });
  }

  try {
    const month = new Date().toISOString().slice(0, 7);
    const key = await putFile(`community/${month}`, buffer, type);
    const [upload] = await db
      .insert(communityUploads)
      .values({
        ownerId: viewer.id,
        key,
        type,
        width: dimension(form.get("width")),
        height: dimension(form.get("height")),
      })
      .returning({ id: communityUploads.id, width: communityUploads.width, height: communityUploads.height });
    const body: UploadDTO = {
      id: upload.id,
      url: "",
      width: upload.width ?? undefined,
      height: upload.height ?? undefined,
      gif: type === "image/gif",
    };
    return NextResponse.json(body);
  } catch (error) {
    logger.error({ userId: viewer.id, err: (error as Error).message }, "community upload failed");
    return NextResponse.json({ error: "We couldn't save that photo. Please try again." }, { status: 500 });
  }
}
