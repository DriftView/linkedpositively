"use client";

import { ImageUp, Minus, Move, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { PHOTO_MAX_BYTES } from "../schemas";

const VIEW = 272;
const OUTPUT = 512;

type Loaded = { url: string; width: number; height: number };

/**
 * Pick a photo, then drag and zoom it inside a round frame. Produces a
 * 512×512 square (the crop is done in the browser, so we never store more
 * of someone's photo than they chose to show).
 */
export function PhotoCropper({
  onChange,
  disabled,
}: {
  /** Called with the cropped square, or null when cleared. */
  onChange: (blob: Blob | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const base = image ? VIEW / Math.min(image.width, image.height) : 1;
  const scale = base * zoom;
  const width = image ? image.width * scale : VIEW;
  const height = image ? image.height * scale : VIEW;

  const clamp = useCallback(
    (x: number, y: number, w = width, h = height) => ({
      x: Math.min(0, Math.max(VIEW - w, x)),
      y: Math.min(0, Math.max(VIEW - h, y)),
    }),
    [width, height],
  );

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  // Re-crop whenever the framing settles.
  useEffect(() => {
    if (!image || dragging) return;
    const timer = setTimeout(() => {
      const element = new Image();
      element.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT;
        canvas.height = OUTPUT;
        const context = canvas.getContext("2d");
        if (!context) return;
        const size = VIEW / scale;
        context.imageSmoothingQuality = "high";
        context.drawImage(element, -offset.x / scale, -offset.y / scale, size, size, 0, 0, OUTPUT, OUTPUT);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.type === "image/webp") return onChange(blob);
            canvas.toBlob((jpeg) => onChange(jpeg), "image/jpeg", 0.9);
          },
          "image/webp",
          0.9,
        );
      };
      element.src = image.url;
    }, 150);
    return () => clearTimeout(timer);
  }, [image, offset, scale, dragging, onChange]);

  function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("That isn't an image. Try a JPG, PNG or WebP photo.");
    if (file.size > PHOTO_MAX_BYTES * 4) return setError("That photo is very large. Please pick one under 20 MB.");
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => {
      const loaded = { url, width: element.naturalWidth, height: element.naturalHeight };
      const s = VIEW / Math.min(loaded.width, loaded.height);
      setImage(loaded);
      setZoom(1);
      setOffset({ x: (VIEW - loaded.width * s) / 2, y: (VIEW - loaded.height * s) / 2 });
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      setError("We couldn't open that photo. Try a different one.");
    };
    element.src = url;
  }

  function setZoomKeepingCentre(next: number) {
    if (!image) return;
    const nextScale = base * next;
    const centreX = (VIEW / 2 - offset.x) / scale;
    const centreY = (VIEW / 2 - offset.y) / scale;
    const w = image.width * nextScale;
    const h = image.height * nextScale;
    setZoom(next);
    setOffset(clamp(VIEW / 2 - centreX * nextScale, VIEW / 2 - centreY * nextScale, w, h));
  }

  function clear() {
    setImage(null);
    onChange(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-col items-center">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        id="profile-photo-input"
        onChange={(event) => pick(event.target.files?.[0])}
        disabled={disabled}
      />

      {image ? (
        <>
          <div
            className={cn(
              "relative touch-none overflow-hidden rounded-3xl bg-muted select-none",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
            style={{ width: VIEW, height: VIEW }}
            role="application"
            aria-label="Drag to position your photo. Use the arrow keys to move it."
            tabIndex={0}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 24 : 8;
              const moves: Record<string, [number, number]> = {
                ArrowLeft: [step, 0],
                ArrowRight: [-step, 0],
                ArrowUp: [0, step],
                ArrowDown: [0, -step],
              };
              const move = moves[event.key];
              if (!move) return;
              event.preventDefault();
              setOffset((current) => clamp(current.x + move[0], current.y + move[1]));
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
              setDragging(true);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              setOffset(clamp(drag.current.ox + event.clientX - drag.current.x, drag.current.oy + event.clientY - drag.current.y));
            }}
            onPointerUp={() => {
              drag.current = null;
              setDragging(false);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(false);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img
              src={image.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width, height, left: offset.x, top: offset.y }}
            />
            {/* round mask preview */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/85"
              style={{ boxShadow: "0 0 0 999px color-mix(in oklch, black 45%, transparent)" }}
            />
            {!dragging ? (
              <span className="pointer-events-none absolute bottom-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[0.7rem] font-medium text-white">
                <Move className="size-3" aria-hidden /> Drag to adjust
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex w-full max-w-[272px] items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full"
              aria-label="Zoom out"
              onClick={() => setZoomKeepingCentre(Math.max(1, zoom - 0.25))}
            >
              <Minus />
            </Button>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.01}
              onValueChange={([value]) => setZoomKeepingCentre(value)}
              aria-label="Zoom"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full"
              aria-label="Zoom in"
              onClick={() => setZoomKeepingCentre(Math.min(3, zoom + 0.25))}
            >
              <Plus />
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="outline" className="h-10 rounded-full" asChild>
              <label htmlFor="profile-photo-input">
                <ImageUp /> Choose another
              </label>
            </Button>
            <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={clear}>
              <RotateCcw /> Start over
            </Button>
          </div>
        </>
      ) : (
        <label
          htmlFor="profile-photo-input"
          className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-muted/40 px-6 py-12 text-center transition-colors hover:border-primary/40 hover:bg-secondary/60 focus-within:ring-3 focus-within:ring-ring/50"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            pick(event.dataTransfer.files?.[0]);
          }}
        >
          <span className="grid size-14 place-items-center rounded-full bg-card text-primary shadow-soft">
            <ImageUp className="size-6" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">Choose a photo</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Square photos work best. You can drag and zoom to frame it.
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            Only people signed in to Link Positively can see it.
          </span>
        </label>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
