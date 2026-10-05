import { contentDisposition } from "@/lib/content-disposition";
import { EXTENSION_TYPES, readSignedFile } from "@/server/services/storage";

/**
 * Serves stored files through short-lived signed URLs created by
 * `signedFileUrl`: local uploads in development, and Cloudinary files that
 * need a download filename.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const file = await readSignedFile(params);
  if (!file) return new Response("Not found", { status: 404 });

  const ext = file.key.split(".").pop() ?? "";
  const type = EXTENSION_TYPES[ext] ?? "application/octet-stream";
  const inline = type.startsWith("image/") || type === "application/pdf";
  const name = params.get("name") || `file.${ext}`;

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", name),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
