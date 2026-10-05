"use client";

import { AnimatePresence, motion } from "motion/react";
import { ImagePlus, SendHorizontal, TriangleAlert, MonitorPlay, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createPost, updatePost } from "../actions";
import { HEADLINE_MAX, POST_MAX_TEXT, type PostDTO, type ViewerDTO } from "../types";
import { parseYouTube, youTubeThumbnail } from "../youtube";
import { PHOTO_ACCEPT, PhotoAttachment, usePhotoUpload } from "./media";
import { RichEditor, type RichEditorHandle } from "./rich-editor";

const DRAFT_KEY = "lp.wall.draft";

function readDraft() {
  try {
    return window.localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(html: string) {
  try {
    if (html) window.localStorage.setItem(DRAFT_KEY, html);
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable: drafts are a convenience */
  }
}

/**
 * New-post composer ("What's on your mind?") and the post editor (mode
 * "edit"). Text with @mentions and #hashtags, one photo, one YouTube link and
 * an optional content warning / headline (the old "!Headline!" convention).
 */
export function PostComposer({
  viewer,
  mode = "create",
  post,
  onDone,
  onCancel,
  className,
}: {
  viewer: ViewerDTO;
  mode?: "create" | "edit";
  post?: PostDTO;
  onDone: (post: PostDTO) => void;
  onCancel?: () => void;
  className?: string;
}) {
  const editing = mode === "edit" && post;
  const editorRef = useRef<RichEditorHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { cw: useId(), video: useId() };

  const [text, setText] = useState(editing ? htmlLength(post.sourceHtml) : 0);
  const [hasText, setHasText] = useState(Boolean(editing && post.sourceHtml));
  const [focused, setFocused] = useState(false);
  const [cwOpen, setCwOpen] = useState(Boolean(editing && post.headline));
  const [headline, setHeadline] = useState(editing ? (post.headline ?? "") : "");
  const [videoOpen, setVideoOpen] = useState(Boolean(editing && post.video));
  const [videoUrl, setVideoUrl] = useState(
    editing && post.video ? `https://www.youtube.com/watch?v=${post.video.id}${post.video.start ? `&t=${post.video.start}s` : ""}` : "",
  );
  const [keepPhoto, setKeepPhoto] = useState(Boolean(editing && post.photo));
  const [submitting, setSubmitting] = useState(false);
  const photo = usePhotoUpload();

  useEffect(() => {
    if (mode !== "create") return;
    const draft = readDraft();
    if (draft) editorRef.current?.setHtml(draft);
  }, [mode]);

  const video = videoUrl.trim() ? parseYouTube(videoUrl) : null;
  const videoInvalid = Boolean(videoUrl.trim()) && !video;
  const hasPhoto = photo.state.status === "ready" || keepPhoto;
  const canSubmit = !submitting && !photo.busy && !videoInvalid && photo.state.status !== "error" && (hasText || hasPhoto || Boolean(video));
  const expanded = focused || hasText || cwOpen || videoOpen || photo.state.status !== "idle" || Boolean(editing);
  const nearLimit = text > POST_MAX_TEXT * 0.8;

  function reset() {
    editorRef.current?.clear();
    setHasText(false);
    setText(0);
    setCwOpen(false);
    setHeadline("");
    setVideoOpen(false);
    setVideoUrl("");
    photo.reset();
    writeDraft("");
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const payload = {
      html: editorRef.current?.getHtml() ?? "",
      headline: cwOpen ? headline.trim() || undefined : undefined,
      uploadId: photo.state.status === "ready" ? photo.state.upload.id : undefined,
      videoUrl: video ? videoUrl.trim() : undefined,
    };
    const result = editing
      ? await updatePost({ ...payload, id: post.id, removePhoto: !keepPhoto })
      : await createPost(payload);
    setSubmitting(false);
    if (!result?.data?.post) {
      toast.error(result?.serverError ?? firstValidationError(result?.validationErrors) ?? "Couldn't save your post. Please try again.");
      return;
    }
    if (!editing) {
      reset();
      toast.success("Posted to the wall");
    } else toast.success("Your post was updated");
    onDone(result.data.post);
  }

  function onPaste(event: React.ClipboardEvent) {
    const file = [...event.clipboardData.files].find((item) => item.type.startsWith("image/"));
    if (file) {
      event.preventDefault();
      setKeepPhoto(false);
      void photo.upload(file);
    }
  }

  const photoSrc = photo.state.status !== "idle" ? photo.state.preview : keepPhoto && post?.photo ? post.photo.url : null;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-3.5 shadow-soft transition-shadow sm:p-4",
        focused && "shadow-lift ring-1 ring-primary/15",
        className,
      )}
      onPaste={onPaste}
    >
      <div className="flex gap-3">
        <UserAvatar userId={viewer.id} name={viewer.name} size="md" className="mt-0.5 hidden sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <AnimatePresence initial={false}>
            {cwOpen ? (
              <motion.div
                key="cw"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <label htmlFor={ids.cw} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-warning-foreground dark:text-warning">
                  <TriangleAlert className="size-3.5" /> Content warning or headline
                </label>
                <div className="relative">
                  <Input
                    id={ids.cw}
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value.slice(0, HEADLINE_MAX))}
                    placeholder="e.g. Talking about a hard day"
                    className="h-10 rounded-xl border-warning/50 bg-warning/10 pr-10 font-medium"
                    autoFocus={!editing}
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                    aria-label="Remove content warning"
                    onClick={() => {
                      setCwOpen(false);
                      setHeadline("");
                    }}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Your post stays folded behind this line until someone chooses to open it.</p>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div
            className={cn(
              "rounded-xl bg-muted/50 px-3.5 py-2.5 transition-colors",
              focused && "bg-muted/70",
            )}
            onClick={() => editorRef.current?.focus()}
          >
            <RichEditor
              ref={editorRef}
              label={editing ? "Edit your post" : "New post"}
              placeholder="What's on your mind?"
              initialHtml={editing ? post.sourceHtml : undefined}
              autoFocus={Boolean(editing)}
              editorClassName={cn("transition-[min-height] duration-300", expanded ? "min-h-[5.5rem]" : "min-h-[1.6rem]")}
              onFocus={() => setFocused(true)}
              onChange={({ html, text: plain, empty }) => {
                setHasText(!empty && Boolean(plain.trim() || /data-type=/.test(html)));
                setText(plain.length);
                if (mode === "create") writeDraft(empty ? "" : html);
              }}
              onSubmit={submit}
            />
          </div>

          {photoSrc ? (
            <PhotoAttachment
              src={photoSrc}
              state={photo.state.status !== "idle" ? photo.state : undefined}
              onRemove={() => {
                photo.reset();
                setKeepPhoto(false);
              }}
            />
          ) : null}

          <AnimatePresence initial={false}>
            {videoOpen ? (
              <motion.div
                key="video"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <label htmlFor={ids.video} className="sr-only">
                  YouTube link
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <MonitorPlay className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id={ids.video}
                      value={videoUrl}
                      onChange={(event) => setVideoUrl(event.target.value)}
                      placeholder="Paste a YouTube link"
                      inputMode="url"
                      aria-invalid={videoInvalid || undefined}
                      aria-describedby={videoInvalid ? `${ids.video}-error` : undefined}
                      className="h-10 rounded-xl pl-9"
                      autoFocus={!editing}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    className="rounded-full"
                    aria-label="Remove video"
                    onClick={() => {
                      setVideoOpen(false);
                      setVideoUrl("");
                    }}
                  >
                    <X />
                  </Button>
                </div>
                {videoInvalid ? (
                  <p id={`${ids.video}-error`} className="mt-1.5 text-xs font-medium text-destructive">
                    Only YouTube videos can be shared. Please check the link.
                  </p>
                ) : null}
                {video ? (
                  <div className="mt-2 flex items-center gap-3 rounded-xl bg-muted/60 p-2 animate-rise">
                    {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube poster */}
                    <img src={youTubeThumbnail(video.id)} alt="" className="h-12 w-20 rounded-lg object-cover" />
                    <span className="text-sm font-medium">YouTube video ready to share</span>
                  </div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              accept={PHOTO_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setKeepPhoto(false);
                  void photo.upload(file);
                }
                event.target.value = "";
              }}
            />
            <ToolButton label="Add a photo" onClick={() => fileRef.current?.click()} active={Boolean(photoSrc)}>
              <ImagePlus /> <span className="hidden sm:inline">Photo</span>
            </ToolButton>
            <ToolButton label="Share a YouTube video" onClick={() => setVideoOpen((value) => !value)} active={videoOpen}>
              <MonitorPlay /> <span className="hidden sm:inline">Video</span>
            </ToolButton>
            <ToolButton label="Add a content warning or headline" onClick={() => setCwOpen((value) => !value)} active={cwOpen}>
              <TriangleAlert /> CW
            </ToolButton>

            <div className="ml-auto flex items-center gap-2">
              {nearLimit ? (
                <span className={cn("text-xs tabular-nums", text > POST_MAX_TEXT ? "text-destructive" : "text-muted-foreground")}>
                  {POST_MAX_TEXT - text}
                </span>
              ) : null}
              {onCancel ? (
                <Button type="button" variant="ghost" className="h-10 rounded-full px-4" onClick={onCancel} disabled={submitting}>
                  Cancel
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={submit}
                disabled={!canSubmit || text > POST_MAX_TEXT}
                className="h-10 rounded-full px-5 font-semibold"
              >
                {submitting ? <Spinner /> : editing ? null : <SendHorizontal />}
                {editing ? "Save" : "Post"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "h-10 gap-1.5 rounded-full px-3 font-semibold text-muted-foreground hover:text-foreground [&_svg]:size-[1.1rem]",
            active && "bg-secondary text-secondary-foreground hover:bg-secondary",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function htmlLength(html: string) {
  return html.replace(/<[^>]*>/g, "").length;
}

export function firstValidationError(errors: unknown): string | undefined {
  if (!errors || typeof errors !== "object") return undefined;
  for (const value of Object.values(errors as Record<string, unknown>)) {
    if (value && typeof value === "object" && "_errors" in value) {
      const list = (value as { _errors?: string[] })._errors;
      if (list?.length) return list[0];
    }
  }
  return undefined;
}
