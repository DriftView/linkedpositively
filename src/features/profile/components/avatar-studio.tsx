"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, ImageUp, Lock, Smile, Trash2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AVATAR_PACKS, avatarSrc } from "@/features/gamification/catalog";
import { LEVELS } from "@/features/gamification/levels";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { chooseAvatar, removePhoto, uploadPhoto } from "../actions";
import { PhotoCropper } from "./photo-cropper";
import { ResponsiveDialog } from "./responsive-dialog";

type Tab = "avatars" | "photo";

/**
 * Change your picture: pick from the avatar packs (later packs unlock with
 * levels; the server enforces the same rule) or upload and crop a photo.
 * Remount it (change its `key`) each time it opens to start fresh.
 */
export function AvatarStudio({
  open,
  onOpenChange,
  userId,
  name,
  level,
  points,
  avatarId,
  hasPhoto,
  version,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  name: string;
  level: number;
  points: number;
  avatarId: string | null;
  hasPhoto: boolean;
  version: string | null;
  onSaved: (update: { avatarId?: string | null; hasPhoto: boolean; version: string }) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("avatars");
  const [selected, setSelected] = useState<string | null>(avatarId);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const packRefs = useRef<Record<number, HTMLElement | null>>({});

  const avatarAction = useAction(chooseAvatar);
  const photoAction = useAction(uploadPhoto);
  const removeAction = useAction(removePhoto);
  const pending = avatarAction.isPending || photoAction.isPending || removeAction.isPending;

  // Revoke the last preview URL when the studio goes away.
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const onCrop = useCallback((blob: Blob | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = blob ? URL.createObjectURL(blob) : null;
    setPhoto(blob);
    setPhotoUrl(previewRef.current);
  }, []);

  function celebrate(completed?: boolean) {
    if (completed) toast.success("Profile complete! +50 points", { description: "Thanks for telling the community about you." });
  }

  async function saveAvatar() {
    if (!selected) return;
    const result = await avatarAction.executeAsync({ avatarId: selected });
    if (!result?.data) return void toast.error(result?.serverError ?? "We couldn't save your avatar. Please try again.");
    toast.success("Your avatar has been updated.");
    celebrate(result.data.completed);
    onSaved({ avatarId: selected, hasPhoto: false, version: result.data.version });
    onOpenChange(false);
    router.refresh();
  }

  async function savePhoto() {
    if (!photo) return;
    const form = new FormData();
    form.set("photo", new File([photo], photo.type === "image/webp" ? "photo.webp" : "photo.jpg", { type: photo.type }));
    const result = await photoAction.executeAsync(form);
    if (!result?.data) return void toast.error(result?.serverError ?? "We couldn't upload your photo. Please try again.");
    toast.success("Your photo is up!");
    celebrate(result.data.completed);
    onSaved({ hasPhoto: true, version: result.data.version });
    onOpenChange(false);
    router.refresh();
  }

  async function deletePhoto() {
    const result = await removeAction.executeAsync();
    if (!result?.data) return void toast.error(result?.serverError ?? "We couldn't remove your photo.");
    toast.success(avatarId ? "Photo removed. Your avatar is back." : "Photo removed.");
    onSaved({ hasPhoto: false, version: result.data.version });
    onOpenChange(false);
    router.refresh();
  }

  const previewSrc =
    tab === "photo"
      ? (photoUrl ?? (hasPhoto ? `/api/avatars/${userId}?v=${version ?? ""}` : null))
      : selected && (selected !== avatarId || !hasPhoto)
        ? avatarSrc(selected)
        : hasPhoto || avatarId
          ? `/api/avatars/${userId}?v=${version ?? ""}`
          : null;

  const avatarChanged = Boolean(selected && (selected !== avatarId || hasPhoto));

  const footer =
    tab === "avatars" ? (
      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground sm:max-w-[55%]">
          {hasPhoto && avatarChanged ? "Choosing an avatar replaces your uploaded photo." : `You can use ${unlockedCount(level)} of ${totalCount()} avatars.`}
        </p>
        <Button className="h-11 rounded-full px-6 text-[0.95rem]" disabled={!avatarChanged || pending} onClick={saveAvatar}>
          {avatarAction.isPending ? <Spinner /> : <Check />} Save avatar
        </Button>
      </div>
    ) : (
      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        {hasPhoto && !photo ? (
          <Button variant="ghost" className="h-11 rounded-full text-destructive hover:text-destructive" onClick={deletePhoto} disabled={pending}>
            {removeAction.isPending ? <Spinner /> : <Trash2 />} Remove my photo
          </Button>
        ) : (
          <span />
        )}
        <Button className="h-11 rounded-full px-6 text-[0.95rem]" disabled={!photo || pending} onClick={savePhoto}>
          {photoAction.isPending ? <Spinner /> : <Check />} Use this photo
        </Button>
      </div>
    );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title="Change your picture"
      description="Pick an avatar or use your own photo."
      footer={footer}
    >
      <div className="sticky top-0 z-10 -mx-1 bg-popover px-1 pb-3">
        <div className="flex items-center gap-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-secondary ring-2 ring-border sm:size-18">
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview may be a blob URL
              <img src={previewSrc} alt="Preview of your picture" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center font-semibold text-secondary-foreground">{initials(name)}</span>
            )}
          </div>
          <div role="tablist" aria-label="Picture type" className="inline-flex flex-1 rounded-full bg-muted p-1">
            {(
              [
                ["avatars", "Avatars", Smile],
                ["photo", "Your photo", ImageUp],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-medium text-muted-foreground transition-all",
                  tab === value && "bg-card text-foreground shadow-sm",
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
        </div>
        {tab === "avatars" ? (
          <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {AVATAR_PACKS.map((pack) => {
              const locked = level < pack.level;
              return (
                <button
                  key={pack.pack}
                  type="button"
                  onClick={() => packRefs.current[pack.pack]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-muted",
                    locked ? "text-muted-foreground" : "bg-card",
                  )}
                >
                  {locked ? <Lock className="size-3" aria-label="Locked" /> : null}
                  {pack.name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {tab === "avatars" ? (
        <div className="space-y-6 pt-1">
          {AVATAR_PACKS.map((pack) => {
            const locked = level < pack.level;
            const needed = Math.max(0, (LEVELS[pack.level - 1]?.min ?? 0) - points);
            return (
              <section
                key={pack.pack}
                ref={(element) => {
                  packRefs.current[pack.pack] = element;
                }}
                className="scroll-mt-28"
                aria-label={`Avatars pack ${pack.pack} of ${AVATAR_PACKS.length}${locked ? ", locked" : ""}`}
              >
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <h3 className="font-sans text-sm font-semibold">
                    {pack.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      · Pack {pack.pack} of {AVATAR_PACKS.length}
                    </span>
                  </h3>
                  {locked ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <Lock className="size-3" aria-hidden /> Level {pack.level}
                    </span>
                  ) : null}
                </div>
                <div className="relative">
                  <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                    {pack.avatars.map((id) => {
                      const active = selected === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={locked}
                          aria-pressed={active}
                          aria-label={`${pack.name} avatar ${id.slice(-2)}`}
                          onClick={() => setSelected(id)}
                          className={cn(
                            "group relative aspect-square rounded-full outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/60",
                            !locked && "hover:scale-[1.04] active:scale-95",
                            active && "ring-3 ring-primary ring-offset-2 ring-offset-popover",
                          )}
                        >
                          <Image
                            src={avatarSrc(id)}
                            alt=""
                            width={96}
                            height={96}
                            className={cn("size-full rounded-full", locked && "opacity-45 grayscale-[60%]")}
                          />
                          {active ? (
                            <span className="absolute -right-0.5 -bottom-0.5 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-popover">
                              <Check className="size-3.5" aria-hidden />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {locked ? (
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="flex items-center gap-2 rounded-full bg-popover/95 px-4 py-2 text-sm shadow-lift ring-1 ring-border">
                        <Lock className="size-4 text-brand-magenta" aria-hidden />
                        <span>
                          Unlocks at <span className="font-semibold">Level {pack.level}</span>
                          <span className="text-muted-foreground"> · {needed.toLocaleString()} pts to go</span>
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="pt-2">
          <PhotoCropper onChange={onCrop} disabled={pending} />
        </div>
      )}
    </ResponsiveDialog>
  );
}

function unlockedCount(level: number) {
  return AVATAR_PACKS.filter((pack) => level >= pack.level).reduce((sum, pack) => sum + pack.avatars.length, 0);
}
function totalCount() {
  return AVATAR_PACKS.reduce((sum, pack) => sum + pack.avatars.length, 0);
}
