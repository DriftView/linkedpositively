"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Rich text for staff-authored content (tips, check-in feedback). Output is
 * HTML; the server sanitizes it with sanitizeStaffHtml before storing.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  id,
  minHeight = "10rem",
  invalid,
  "aria-labelledby": labelledBy,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  id?: string;
  minHeight?: string;
  invalid?: boolean;
  "aria-labelledby"?: string;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
        code: false,
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Write something…" }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "prose-content min-h-[var(--rte-min)] px-3.5 py-3 outline-none [&>:first-child]:mt-0",
        ...(id ? { id } : {}),
        ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.isEmpty ? "" : editor.getHTML()),
  });

  // Keep in sync when the value is replaced from outside (e.g. form reset).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  return (
    <div
      style={{ "--rte-min": minHeight } as React.CSSProperties}
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-background transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        invalid && "border-destructive ring-3 ring-destructive/20",
        "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
      )}
    >
      {editor ? <Toolbar editor={editor} /> : <div className="h-10 border-b bg-muted/40" />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const c = () => editor.chain().focus();
  const buttons: { label: string; icon: React.ElementType; active?: boolean; disabled?: boolean; run: () => void }[][] = [
    [
      { label: "Bold", icon: Bold, active: state.bold, run: () => c().toggleBold().run() },
      { label: "Italic", icon: Italic, active: state.italic, run: () => c().toggleItalic().run() },
      { label: "Underline", icon: Underline, active: state.underline, run: () => c().toggleUnderline().run() },
    ],
    [
      { label: "Heading", icon: Heading2, active: state.h2, run: () => c().toggleHeading({ level: 2 }).run() },
      { label: "Subheading", icon: Heading3, active: state.h3, run: () => c().toggleHeading({ level: 3 }).run() },
      { label: "Bulleted list", icon: List, active: state.bullet, run: () => c().toggleBulletList().run() },
      { label: "Numbered list", icon: ListOrdered, active: state.ordered, run: () => c().toggleOrderedList().run() },
      { label: "Quote", icon: Quote, active: state.quote, run: () => c().toggleBlockquote().run() },
    ],
    [
      { label: "Remove link", icon: Unlink, disabled: !state.link, run: () => c().unsetLink().run() },
    ],
    [
      { label: "Undo", icon: Undo2, disabled: !state.canUndo, run: () => c().undo().run() },
      { label: "Redo", icon: Redo2, disabled: !state.canRedo, run: () => c().redo().run() },
    ],
  ];

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
      {buttons.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5 [&:not(:last-child)]:mr-1 [&:not(:last-child)]:border-r [&:not(:last-child)]:pr-1">
          {gi === 2 ? <LinkButton editor={editor} active={state.link} /> : null}
          {group.map((b) => (
            <button
              key={b.label}
              type="button"
              title={b.label}
              aria-label={b.label}
              aria-pressed={b.active ?? undefined}
              disabled={b.disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={b.run}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-35",
                b.active && "bg-background text-primary shadow-xs",
              )}
            >
              <b.icon className="size-4" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Link entry in a small popover (http, https, mailto and tel only). */
function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function apply(event: React.FormEvent) {
    event.preventDefault();
    // The popover is portaled, but React events still bubble to the page's form.
    event.stopPropagation();
    const href = url.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setOpen(false);
      return;
    }
    const normalized = /^[a-z]+:/i.test(href) ? href : `https://${href}`;
    if (!/^(https?:|mailto:|tel:)/i.test(normalized)) {
      setError("Use a web address, email (mailto:) or phone (tel:) link.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Add link"
          aria-label="Add link"
          aria-pressed={active}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground",
            active && "bg-background text-primary shadow-xs",
          )}
        >
          <Link2 className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <form onSubmit={apply} className="space-y-2">
          <label htmlFor="rte-link" className="text-sm font-medium">
            Link address
          </label>
          <div className="flex gap-2">
            <Input id="rte-link" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-9" />
            <Button type="submit" size="lg">
              Apply
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">Leave empty to remove the link.</p>}
        </form>
      </PopoverContent>
    </Popover>
  );
}
