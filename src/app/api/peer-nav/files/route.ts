import { revalidatePath } from "next/cache";
import { fileSpaceAccess } from "@/features/peer-nav/access";
import { getViewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { pnFiles } from "@/server/db/schema";
import { logger } from "@/server/logger";
import {
  EXTENSION_TYPES,
  isAllowedUpload,
  MAX_UPLOAD_BYTES,
  putFile,
  type UploadType,
} from "@/server/services/storage";
import type { FileItem } from "@/features/peer-nav/types";

/**
 * Uploads one shared file into a participant's Peer Navigation file space
 * (multipart: `participantId`, `file`). One request per file so the client
 * can show per-file progress. Access: the participant, their coach,
 * coordinators/admins.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Please sign in again." }, { status: 401 });

  // Reject oversized bodies before buffering them (the form parser reads everything).
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json(
      { error: `Files can be up to ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "That upload didn't come through. Please try again." }, { status: 400 });
  }
  const participantId = String(form.get("participantId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload." }, { status: 400 });

  const access = await fileSpaceAccess(viewer, participantId);
  if (!access) return Response.json({ error: "You don't have access to these files." }, { status: 403 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExtension = EXTENSION_TYPES[ext === "jpeg" ? "jpg" : ext] as UploadType | undefined;
  // Browsers often send office files with an empty or generic type: trust the extension then.
  const type = isAllowedUpload(file.type) ? file.type : byExtension;
  if (!type || (byExtension && byExtension !== type)) {
    return Response.json({ error: `${file.name} isn't a supported file type.` }, { status: 415 });
  }
  if (file.size === 0) return Response.json({ error: `${file.name} is empty.` }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `${file.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  try {
    const key = await putFile(`peer-nav/${participantId}`, Buffer.from(await file.arrayBuffer()), type);
    const filename = file.name.replace(/[\\/\r\n"]/g, "_").slice(0, 200) || `file.${ext}`;
    const [doc] = await db
      .insert(pnFiles)
      .values({ participantId, uploadedBy: viewer.id, filename, mime: type, size: file.size, storageKey: key })
      .returning({ id: pnFiles.id, createdAt: pnFiles.createdAt });
    revalidatePath(`/coach/${participantId}/files`);
    revalidatePath("/coaching/files");
    const item: FileItem = {
      id: doc.id,
      filename,
      mime: type,
      size: file.size,
      createdAt: doc.createdAt.toISOString(),
      uploadedBy: { id: viewer.id, name: viewer.name, username: viewer.username },
      mine: true,
      canRemove: true,
    };
    return Response.json({ file: item });
  } catch (error) {
    logger.error({ participantId, err: (error as Error).message }, "peer-nav file upload failed");
    return Response.json({ error: "We couldn't save that file. Please try again." }, { status: 500 });
  }
}
