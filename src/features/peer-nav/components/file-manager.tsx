"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Download, FileImage, FileSpreadsheet, FileText, FolderOpen, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { friendlyDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { removeFile } from "../actions";
import { FILE_ACCEPT, MAX_FILE_BYTES } from "../constants";
import { fileSize } from "../format";
import type { FileItem } from "../types";
import { actionError } from "./action-result";
import { EmptyState } from "./bits";

const ALLOWED_EXT = FILE_ACCEPT.split(",").map((e) => e.slice(1));

type Upload = { id: string; file: File; progress: number; error: string | null; done: boolean };

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (/sheet|excel|csv/.test(mime)) return FileSpreadsheet;
  return FileText;
}

function uploadOne(participantId: string, file: File, onProgress: (p: number) => void) {
  return new Promise<FileItem>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.set("participantId", participantId);
    body.set("file", file);
    xhr.open("POST", "/api/peer-nav/files");
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => {
      let json: { file?: FileItem; error?: string } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.file) resolve(json.file);
      else reject(new Error(json.error ?? "Upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Connection lost. Check your internet and try again."));
    xhr.send(body);
  });
}

/**
 * Shared files between a participant and their peer navigator (legacy
 * "my files" / "User Files"). Drop or pick several files; each uploads with
 * its own progress. Anyone in the space can download; you remove your own.
 */
export function FileManager({
  participantId,
  files: initialFiles,
  timezone,
  viewerIsParticipant,
  intro,
}: {
  participantId: string;
  files: FileItem[];
  timezone: string;
  viewerIsParticipant: boolean;
  intro?: React.ReactNode;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState(initialFiles);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const [lastServer, setLastServer] = useState(initialFiles);
  if (initialFiles !== lastServer) {
    setLastServer(initialFiles);
    setFiles(initialFiles);
  }

  function validate(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.includes(ext)) return `${file.name}: this file type isn't supported.`;
    if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
    if (file.size === 0) return `${file.name} is empty.`;
    return null;
  }

  async function start(upload: Upload) {
    const setUpload = (patch: Partial<Upload>) => setUploads((list) => list.map((u) => (u.id === upload.id ? { ...u, ...patch } : u)));
    setUpload({ progress: 0, error: null });
    try {
      const saved = await uploadOne(participantId, upload.file, (progress) => setUpload({ progress }));
      setUpload({ progress: 1, done: true });
      setFiles((list) => [saved, ...list]);
      window.setTimeout(() => setUploads((list) => list.filter((u) => u.id !== upload.id)), 900);
      return true;
    } catch (error) {
      setUpload({ error: (error as Error).message });
      return false;
    }
  }

  async function add(list: FileList | File[]) {
    const incoming = [...list].map((file) => ({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, progress: 0, done: false, error: validate(file) }));
    if (!incoming.length) return;
    setUploads((prev) => [...prev, ...incoming]);
    const results = await Promise.all(incoming.filter((u) => !u.error).map(start));
    const ok = results.filter(Boolean).length;
    if (ok) {
      toast.success(ok === 1 ? "File shared" : `${ok} files shared`, {
        description: viewerIsParticipant ? "Your peer navigator can see it now." : "The participant can see it now.",
      });
      router.refresh();
    }
  }

  async function remove(file: FileItem) {
    setRemoving(file.id);
    const result = await removeFile({ id: file.id });
    setRemoving(null);
    const error = actionError(result);
    if (error) return toast.error(error);
    setFiles((list) => list.filter((f) => f.id !== file.id));
    toast.success("File removed");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {intro}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void add(e.dataTransfer.files);
        }}
        className={cn(
          "relative flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-5 py-7 text-center transition-colors",
          dragging ? "border-primary bg-secondary/70" : "border-border bg-muted/30",
        )}
      >
        <span className={cn("grid size-12 place-items-center rounded-2xl bg-card shadow-soft transition-transform", dragging && "scale-110")}>
          <UploadCloud aria-hidden className="size-6 text-primary" />
        </span>
        <div>
          <p className="text-sm font-medium">
            <span className="max-sm:hidden">Drop files here or </span>
            <label htmlFor={inputId} className="cursor-pointer text-primary underline-offset-4 hover:underline">
              <span className="sm:hidden">Choose files to share</span>
              <span className="max-sm:hidden">choose files</span>
            </label>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">PDF, Word, Excel, CSV or images · up to {MAX_FILE_BYTES / 1024 / 1024} MB each</p>
        </div>
        <Button type="button" className="rounded-full sm:hidden" size="lg" onClick={() => inputRef.current?.click()}>
          <UploadCloud aria-hidden />
          Add files
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <AnimatePresence initial={false}>
        {uploads.length ? (
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2" aria-label="Uploads" aria-live="polite">
            {uploads.map((upload) => (
              <motion.li
                key={upload.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn("rounded-xl border bg-card px-3.5 py-2.5", upload.error && "border-destructive/40 bg-destructive/5")}
              >
                <div className="flex items-center gap-3">
                  {upload.error ? <AlertCircle aria-hidden className="size-4 shrink-0 text-destructive" /> : <UploadCloud aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate text-sm">{upload.file.name}</span>
                  {upload.error ? (
                    <>
                      {validate(upload.file) ? null : (
                        <Button size="icon-sm" variant="ghost" aria-label={`Retry ${upload.file.name}`} onClick={() => void start(upload)}>
                          <RotateCcw aria-hidden />
                        </Button>
                      )}
                      <Button size="icon-sm" variant="ghost" aria-label={`Dismiss ${upload.file.name}`} onClick={() => setUploads((l) => l.filter((u) => u.id !== upload.id))}>
                        <X aria-hidden />
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground tabular-nums">{upload.done ? "Done" : `${Math.round(upload.progress * 100)}%`}</span>
                  )}
                </div>
                {upload.error ? (
                  <p className="mt-1 pl-7 text-xs text-destructive">{upload.error}</p>
                ) : (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(upload.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${upload.file.name}`}>
                    <div className={cn("h-full rounded-full transition-[width] duration-200", upload.done ? "bg-success" : "bg-primary")} style={{ width: `${Math.max(4, upload.progress * 100)}%` }} />
                  </div>
                )}
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>

      {files.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No files yet"
          description={
            viewerIsParticipant
              ? "Worksheets and activities you share with your peer navigator will appear here, along with anything they share with you."
              : "Files you and the participant share will appear here."
          }
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
          <AnimatePresence initial={false}>
            {files.map((file) => {
              const Icon = iconFor(file.mime);
              const by = file.mine ? "You" : (file.uploadedBy?.name ?? "Someone");
              return (
                <motion.li key={file.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", file.mine ? "bg-secondary text-secondary-foreground" : "bg-brand-sky/20 text-foreground")}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/peer-nav/files/${file.id}`}
                      target="_blank"
                      rel="noopener"
                      className="block truncate rounded text-sm font-medium outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {file.filename}
                    </a>
                    <p className="truncate text-xs text-muted-foreground">
                      {fileSize(file.size)} · Shared by {by} · {friendlyDate(file.createdAt, timezone)}
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="icon-lg" className="size-10">
                    <a href={`/api/peer-nav/files/${file.id}`} download aria-label={`Download ${file.filename}`}>
                      <Download aria-hidden />
                    </a>
                  </Button>
                  {file.canRemove ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground hover:text-destructive" aria-label={`Remove ${file.filename}`} disabled={removing === file.id}>
                          <Trash2 aria-hidden />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove this file?</AlertDialogTitle>
                          <AlertDialogDescription>
                            “{file.filename}” will be removed for {viewerIsParticipant ? "you and your peer navigator" : "you and the participant"}. This can&apos;t be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep it</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => void remove(file)}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
