"use client";

import { ImagePlus, SendHorizontal, MonitorPlay, X } from "lucide-react";
import { forwardRef, useId, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { createComment, updateComment } from "../actions";
import { COMMENT_MAX_TEXT, type CommentDTO, type CommentTarget, type ViewerDTO } from "../types";
import { parseYouTube } from "../youtube";
import { PHOTO_ACCEPT, PhotoAttachment, usePhotoUpload } from "./media";
import { firstValidationError } from "./post-composer";
import { RichEditor, type RichEditorHandle } from "./rich-editor";

export type CommentComposerHandle = { focus: () => void };

export type PendingComment = { html: string; photoPreview: string | null; videoId: string | null };

/** Comment box (and inline comment editor): text with @mentions/#tags, a photo or a YouTube link. */
export const CommentComposer = forwardRef<
  CommentComposerHandle,
  {
    target: CommentTarget;
    viewer: ViewerDTO;
    comment?: CommentDTO;
    onSubmitting?: (pending: PendingComment) => void;
    onDone: (comment: CommentDTO | null) => void;
    onCancel?: () => void;
    autoFocus?: boolean;
  }
>(function CommentComposer({ target, viewer, comment, onSubmitting, onDone, onCancel, autoFocus }, ref) {
  const editorRef = useRef<RichEditorHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoId = useId();
  const [hasText, setHasText] = useState(Boolean(comment?.sourceHtml));
  const [length, setLength] = useState(0);
  const [videoOpen, setVideoOpen] = useState(Boolean(comment?.video));
  const [videoUrl, setVideoUrl] = useState(comment?.video ? `https://youtu.be/${comment.video.id}` : "");
  const [keepPhoto, setKeepPhoto] = useState(Boolean(comment?.photo));
  const [submitting, setSubmitting] = useState(false);
  const photo = usePhotoUpload();

  useImperativeHandle(ref, () => ({ focus: () => editorRef.current?.focus() }), []);

  const video = videoUrl.trim() ? parseYouTube(videoUrl) : null;
  const videoInvalid = Boolean(videoUrl.trim()) && !video;
  const hasPhoto = photo.state.status === "ready" || keepPhoto;
  const canSubmit =
    !submitting && !photo.busy && !videoInvalid && photo.state.status !== "error" && length <= COMMENT_MAX_TEXT && (hasText || hasPhoto || Boolean(video));

  async function submit() {
    if (!canSubmit) return;
    const html = editorRef.current?.getHtml() ?? "";
    const payload = {
      html,
      uploadId: photo.state.status === "ready" ? photo.state.upload.id : undefined,
      videoUrl: video ? videoUrl.trim() : undefined,
    };
    setSubmitting(true);
    if (!comment) {
      onSubmitting?.({
        html,
        photoPreview: photo.state.status === "ready" ? photo.state.preview : null,
        videoId: video?.id ?? null,
      });
      // Clear right away so the box is ready for the next thought.
      editorRef.current?.clear();
      setHasText(false);
    }
    const result = comment
      ? await updateComment({ ...payload, id: comment.id, removePhoto: !keepPhoto })
      : await createComment({ ...payload, target });
    setSubmitting(false);
    if (!result?.data?.comment) {
      if (!comment) editorRef.current?.setHtml(html);
      toast.error(result?.serverError ?? firstValidationError(result?.validationErrors) ?? "Not able to save your comment. Please try again.");
      onDone(null);
      return;
    }
    if (!comment) {
      photo.reset();
      setVideoOpen(false);
      setVideoUrl("");
    }
    onDone(result.data.comment);
  }

  const photoSrc = photo.state.status !== "idle" ? photo.state.preview : keepPhoto && comment?.photo ? comment.photo.url : null;

  return (
    <div className="flex gap-2.5">
      {!comment ? <UserAvatar userId={viewer.id} name={viewer.name} size="sm" className="mt-1" /> : null}
      <div className="min-w-0 flex-1">
        <div
          className="rounded-2xl border border-transparent bg-muted/60 px-3 py-2 transition-colors focus-within:border-ring/40 focus-within:bg-background"
          onPaste={(event) => {
            const file = [...event.clipboardData.files].find((item) => item.type.startsWith("image/"));
            if (file) {
              event.preventDefault();
              setKeepPhoto(false);
              void photo.upload(file);
            }
          }}
        >
          <RichEditor
            ref={editorRef}
            label={comment ? "Edit your comment" : "Add a comment"}
            placeholder="Add a comment…"
            initialHtml={comment?.sourceHtml}
            autoFocus={autoFocus || Boolean(comment)}
            editorClassName="min-h-[1.6rem] text-[0.925rem]"
            onChange={({ html, text, empty }) => {
              setHasText(!empty && Boolean(text.trim() || /data-type=/.test(html)));
              setLength(text.length);
            }}
            onSubmit={submit}
          />
          {photoSrc ? (
            <div className="mt-2">
              <PhotoAttachment
                src={photoSrc}
                state={photo.state.status !== "idle" ? photo.state : undefined}
                onRemove={() => {
                  photo.reset();
                  setKeepPhoto(false);
                }}
              />
            </div>
          ) : null}
          {videoOpen ? (
            <div className="mt-2 flex items-center gap-1.5">
              <label htmlFor={videoId} className="sr-only">
                YouTube link
              </label>
              <Input
                id={videoId}
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder="Paste a YouTube link"
                inputMode="url"
                aria-invalid={videoInvalid || undefined}
                className="h-9 rounded-lg bg-background text-sm"
                autoFocus
              />
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
          ) : null}
          {videoInvalid ? (
            <p className="mt-1 text-xs font-medium text-destructive">Only YouTube videos can be shared.</p>
          ) : null}
          <div className="-mx-1 mt-1 flex items-center gap-0.5">
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("size-9 rounded-full text-muted-foreground", photoSrc && "text-primary")}
              aria-label="Add a photo"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("size-9 rounded-full text-muted-foreground", videoOpen && "text-primary")}
              aria-label="Share a YouTube video"
              aria-pressed={videoOpen}
              onClick={() => setVideoOpen((value) => !value)}
            >
              <MonitorPlay />
            </Button>
            {length > COMMENT_MAX_TEXT * 0.8 ? (
              <span className={cn("ml-1 text-xs tabular-nums", length > COMMENT_MAX_TEXT ? "text-destructive" : "text-muted-foreground")}>
                {COMMENT_MAX_TEXT - length}
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              {onCancel ? (
                <Button type="button" variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={onCancel}>
                  Cancel
                </Button>
              ) : null}
              <Button
                type="button"
                size={comment ? "sm" : "icon"}
                className={cn("rounded-full", comment ? "h-9 px-4" : "size-9")}
                onClick={submit}
                disabled={!canSubmit}
                aria-label={comment ? "Save comment" : "Post comment"}
              >
                {submitting ? <Spinner /> : comment ? "Save" : <SendHorizontal />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
