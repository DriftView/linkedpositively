"use client";

import { Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { PhotoDTO, UploadDTO, VideoDTO } from "../types";
import { youTubeEmbedUrl, youTubeThumbnail } from "../youtube";

/* ---------------------------------------------------------------------------
 * Upload
 * ------------------------------------------------------------------------ */

const ACCEPTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_ACCEPT = ACCEPTED.join(",");

export type PhotoState =
  | { status: "idle" }
  | { status: "uploading"; preview: string; progress: number }
  | { status: "ready"; preview: string; upload: UploadDTO }
  | { status: "error"; preview: string; message: string };

async function measure(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Uploads one photo to /api/community/uploads with progress. */
export function usePhotoUpload() {
  const [state, setState] = useState<PhotoState>({ status: "idle" });
  const request = useRef<XMLHttpRequest | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      request.current?.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  function reset() {
    request.current?.abort();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setState({ status: "idle" });
  }

  async function upload(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Photos can be JPG, PNG, GIF or WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("That photo is too big. Please choose one under 8 MB.");
      return;
    }
    reset();
    const preview = URL.createObjectURL(file);
    previewRef.current = preview;
    setState({ status: "uploading", preview, progress: 4 });

    const size = await measure(file);
    const form = new FormData();
    form.append("file", file);
    if (size) {
      form.append("width", String(size.width));
      form.append("height", String(size.height));
    }
    const xhr = new XMLHttpRequest();
    request.current = xhr;
    xhr.open("POST", "/api/community/uploads");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setState({ status: "uploading", preview, progress: Math.max(4, Math.round((event.loaded / event.total) * 95)) });
      }
    };
    xhr.onload = () => {
      const body = xhr.response as (UploadDTO & { error?: string }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.id) setState({ status: "ready", preview, upload: body });
      else setState({ status: "error", preview, message: body?.error ?? "That upload didn't work. Please try again." });
    };
    xhr.onerror = () => setState({ status: "error", preview, message: "You seem to be offline. Please try again." });
    xhr.send(form);
  }

  return { state, upload, reset, busy: state.status === "uploading" };
}

/** Thumbnail of the photo being attached, with progress and a remove button. */
export function PhotoAttachment({ src, state, onRemove }: { src: string; state?: PhotoState; onRemove: () => void }) {
  const uploading = state?.status === "uploading";
  const failed = state?.status === "error";
  return (
    <div className="relative inline-block animate-rise">
      {/* eslint-disable-next-line @next/next/no-img-element -- local preview / private media */}
      <img
        src={src}
        alt="Photo to attach"
        className={cn("max-h-56 max-w-full rounded-xl border object-cover transition", uploading && "opacity-70", failed && "opacity-40 grayscale")}
      />
      {uploading ? (
        <div className="absolute inset-x-3 bottom-3">
          <Progress value={state.progress} className="h-1.5 bg-background/70" aria-label="Uploading photo" />
        </div>
      ) : null}
      {failed ? (
        <p className="absolute inset-x-2 bottom-2 rounded-lg bg-background/90 px-2 py-1 text-xs font-medium text-destructive">
          {state.message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-foreground/75 text-background backdrop-blur transition hover:bg-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Display
 * ------------------------------------------------------------------------ */

/** A post/comment photo: keeps its aspect ratio, opens full size on tap. GIFs stay animated. */
export function PostPhoto({ photo, alt, compact }: { photo: PhotoDTO; alt: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ratio = photo.width && photo.height ? photo.width / photo.height : undefined;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative block overflow-hidden rounded-xl bg-muted/60 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          compact ? "max-w-60" : "w-full",
        )}
        style={ratio ? { aspectRatio: String(Math.max(ratio, compact ? 0.75 : 0.8)) } : undefined}
        aria-label="Open photo"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private, signed media */}
        <img
          ref={(node) => {
            // Server-rendered images can finish loading before hydration, so onLoad never fires.
            if (node?.complete && node.naturalWidth > 0 && !loaded) setLoaded(true);
          }}
          src={photo.url}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className={cn(
            "size-full object-cover transition duration-500 group-hover:scale-[1.015]",
            !ratio && (compact ? "max-h-60" : "max-h-[32rem]"),
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] w-auto max-w-[min(96vw,64rem)] border-0 bg-transparent p-0 shadow-none sm:max-w-[min(96vw,64rem)]">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          <DialogDescription className="sr-only">{alt}</DialogDescription>
          {/* eslint-disable-next-line @next/next/no-img-element -- private, signed media */}
          <img src={photo.url} alt={alt} className="max-h-[88dvh] w-auto rounded-2xl object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * YouTube video as a lightweight poster; the privacy-enhanced player
 * (youtube-nocookie) loads only when the person presses play.
 */
export function YouTubeEmbed({ video, title = "YouTube video", compact }: { video: VideoDTO; title?: string; compact?: boolean }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-black", compact ? "aspect-video w-full max-w-72" : "aspect-video w-full")}>
      {playing ? (
        <iframe
          src={youTubeEmbedUrl(video)}
          title={title}
          className="absolute inset-0 size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          aria-label={`Play ${title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube poster */}
          <img
            src={youTubeThumbnail(video.id)}
            alt=""
            loading="lazy"
            className="size-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.02] group-hover:opacity-100"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <span className="absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-black shadow-lift transition group-hover:scale-110">
            <Play className="ml-0.5 size-6 fill-current" />
          </span>
          <span className="absolute bottom-2.5 left-3 text-xs font-semibold text-white/90">YouTube</span>
        </button>
      )}
    </div>
  );
}
