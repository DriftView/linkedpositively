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
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Staff rich-text editor (pages, glossary definitions): headings, emphasis,
 * lists, quotes, links and rules. Output is sanitized with sanitizeStaffHtml
 * on the server. Renders in the same `.prose-content` style as the page.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing…",
  minimal = false,
  id,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** No headings/quotes/rules (for short texts like glossary definitions). */
  minimal?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: minimal ? false : { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer" } },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        "aria-label": ariaLabel ?? "Content",
        "aria-multiline": "true",
        role: "textbox",
        class: cn(
          "prose-content min-h-40 px-4 py-3 outline-none [&>*:first-child]:mt-0 [&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
          minimal ? "min-h-28" : "min-h-80",
        ),
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getHTML()),
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-input bg-card transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        className,
      )}
    >
      {editor ? <Toolbar editor={editor} minimal={minimal} /> : <div className="h-11 border-b bg-muted/40" />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, minimal }: { editor: Editor; minimal: boolean }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      link: current.isActive("link"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
      {!minimal ? (
        <>
          <Tool label="Heading" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} icon={Heading2} />
          <Tool label="Subheading" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} icon={Heading3} />
          <Divider />
        </>
      ) : null}
      <Tool label="Bold" shortcut="Ctrl+B" active={state.bold} onClick={() => chain().toggleBold().run()} icon={Bold} />
      <Tool label="Italic" shortcut="Ctrl+I" active={state.italic} onClick={() => chain().toggleItalic().run()} icon={Italic} />
      <Tool label="Underline" shortcut="Ctrl+U" active={state.underline} onClick={() => chain().toggleUnderline().run()} icon={Underline} />
      <Tool label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()} icon={Strikethrough} />
      <Divider />
      <Tool label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()} icon={List} />
      <Tool label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()} icon={ListOrdered} />
      {!minimal ? (
        <>
          <Tool label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()} icon={Quote} />
          <Tool label="Divider line" onClick={() => chain().setHorizontalRule().run()} icon={Minus} />
        </>
      ) : null}
      <Divider />
      <LinkTool editor={editor} active={state.link} />
      <div className="ml-auto flex">
        <Tool label="Undo" shortcut="Ctrl+Z" disabled={!state.canUndo} onClick={() => chain().undo().run()} icon={Undo2} />
        <Tool label="Redo" shortcut="Ctrl+Shift+Z" disabled={!state.canRedo} onClick={() => chain().redo().run()} icon={Redo2} />
      </div>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-border" />;
}

function Tool({
  label,
  shortcut,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon: typeof Bold;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          className={cn(
            "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40",
            active && "bg-background text-primary shadow-soft",
          )}
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-1.5 opacity-60">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function LinkTool({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const value = href.trim();
    if (!value) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else {
      const url = /^(https?:|mailto:|tel:|\/)/i.test(value) ? value : `https://${value}`;
      if (editor.state.selection.empty && !active) editor.chain().focus().insertContent({ type: "text", text: value, marks: [{ type: "link", attrs: { href: url } }] }).run();
      else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setHref((editor.getAttributes("link").href as string | undefined) ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Link"
          aria-pressed={active}
          onMouseDown={(event) => event.preventDefault()}
          className={cn(
            "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
            active && "bg-background text-primary shadow-soft",
          )}
        >
          <Link2 className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <form onSubmit={apply} className="grid gap-2">
          <label htmlFor="rte-link" className="text-sm font-medium">
            Link address
          </label>
          <Input id="rte-link" value={href} onChange={(event) => setHref(event.target.value)} placeholder="https://… or /pages/faq" autoFocus />
          <p className="text-xs text-muted-foreground">Link inside the app with a path like /resources or /pages/help.</p>
          <div className="flex justify-end gap-2">
            {active ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                <Unlink />
                Remove
              </Button>
            ) : null}
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
