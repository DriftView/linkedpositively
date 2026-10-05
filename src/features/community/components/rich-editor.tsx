"use client";

import { Mention, type MentionOptions } from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { PluginKey } from "@tiptap/pm/state";
import { EditorContent, ReactRenderer, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Hash } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { UserAvatar } from "@/components/app/user-avatar";
import { cn } from "@/lib/utils";
import type { AuthorDTO } from "../types";
import { richTextClass } from "./rich-text-styles";

/**
 * The composer's text box: Tiptap with bold/italic/lists/links, @mentions
 * (people who use the community) and #hashtags (existing tags, or a new one).
 * Output HTML is sanitized again on the server.
 */

type SuggestionItem = { kind: "person"; person: AuthorDTO } | { kind: "tag"; name: string; count?: number; isNew?: boolean };
type SuggestionConfig = MentionOptions<SuggestionItem>["suggestion"];

type ListHandle = { onKeyDown: (event: KeyboardEvent) => boolean };
type ListProps = { items: SuggestionItem[]; command: (item: SuggestionItem) => void; loading?: boolean };

const SuggestionList = forwardRef<ListHandle, ListProps>(function SuggestionList({ items, command }, ref) {
  const [index, setIndex] = useState(0);
  const [lastItems, setLastItems] = useState(items);
  if (lastItems !== items) {
    setLastItems(items);
    setIndex(0);
  }

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (!items.length) return false;
      if (event.key === "ArrowDown") {
        setIndex((value) => (value + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setIndex((value) => (value - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(items[index]);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) return null;
  return (
    <div
      role="listbox"
      aria-label="Suggestions"
      className="w-64 animate-rise overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lift"
    >
      {items.map((item, itemIndex) => (
        <button
          key={item.kind === "person" ? item.person.id : item.name}
          type="button"
          role="option"
          aria-selected={itemIndex === index}
          onMouseDown={(event) => {
            event.preventDefault();
            command(item);
          }}
          onMouseEnter={() => setIndex(itemIndex)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm",
            itemIndex === index && "bg-accent text-accent-foreground",
          )}
        >
          {item.kind === "person" ? (
            <>
              <UserAvatar userId={item.person.id} name={item.person.name} size="xs" />
              <span className="min-w-0 flex-1 truncate font-medium">{item.person.name}</span>
              {item.person.username ? (
                <span className="truncate text-xs text-muted-foreground">@{item.person.username}</span>
              ) : null}
            </>
          ) : (
            <>
              <span className="grid size-6 place-items-center rounded-md bg-brand-magenta/10 text-brand-magenta">
                <Hash className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
              <span className="text-xs text-muted-foreground">
                {item.isNew ? "New tag" : item.count === 1 ? "1 post" : `${item.count} posts`}
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  );
});

/** Renders the suggestion popup next to the caret (no positioning library needed). */
function popupRenderer() {
  let component: ReactRenderer<ListHandle, ListProps> | null = null;
  let host: HTMLDivElement | null = null;

  function place(rect: DOMRect | null | undefined) {
    if (!host || !rect) return;
    const width = 256;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = rect.bottom + 6;
    const fitsBelow = below + 240 < window.innerHeight;
    host.style.left = `${left}px`;
    host.style.top = fitsBelow ? `${below}px` : "";
    host.style.bottom = fitsBelow ? "" : `${window.innerHeight - rect.top + 6}px`;
  }

  return {
    onStart(props: { editor: Editor; clientRect?: (() => DOMRect | null) | null } & ListProps) {
      component = new ReactRenderer(SuggestionList, { props, editor: props.editor });
      host = document.createElement("div");
      host.style.position = "fixed";
      host.style.zIndex = "60";
      host.appendChild(component.element);
      document.body.appendChild(host);
      place(props.clientRect?.());
    },
    onUpdate(props: { clientRect?: (() => DOMRect | null) | null } & ListProps) {
      component?.updateProps(props);
      place(props.clientRect?.());
    },
    onKeyDown(props: { event: KeyboardEvent }) {
      if (props.event.key === "Escape") {
        host?.remove();
        return true;
      }
      return component?.ref?.onKeyDown(props.event) ?? false;
    },
    onExit() {
      host?.remove();
      component?.destroy();
      host = null;
      component = null;
    },
  };
}

async function fetchSuggestions(type: "people" | "tags", q: string) {
  try {
    const response = await fetch(`/api/community/suggest?type=${type}&q=${encodeURIComponent(q)}`);
    if (!response.ok) return [];
    return ((await response.json()) as { items: unknown[] }).items;
  } catch {
    return [];
  }
}

const peopleSuggestion: SuggestionConfig = {
  char: "@",
  allowSpaces: false,
  items: async ({ query }) =>
    ((await fetchSuggestions("people", query)) as AuthorDTO[]).map((person) => ({ kind: "person", person }) as const),
  command: ({ editor, range, props }) => {
    const item = props as unknown as SuggestionItem;
    if (item.kind !== "person") return;
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        { type: "mention", attrs: { id: item.person.id, label: item.person.name } },
        { type: "text", text: " " },
      ])
      .run();
  },
  render: popupRenderer as unknown as SuggestionConfig["render"],
};

const TAG_RE = /^\p{L}[\p{L}\p{N}_]{1,49}$/u;

const tagSuggestion: SuggestionConfig = {
  char: "#",
  pluginKey: new PluginKey("hashtag"),
  allowSpaces: false,
  items: async ({ query }) => {
    const found = (await fetchSuggestions("tags", query)) as { name: string; count: number }[];
    const items: SuggestionItem[] = found.map((tag) => ({ kind: "tag", name: tag.name, count: tag.count }));
    const typed = query.toLowerCase();
    if (TAG_RE.test(typed) && !found.some((tag) => tag.name === typed)) items.unshift({ kind: "tag", name: typed, isNew: true });
    return items.slice(0, 6);
  },
  command: ({ editor, range, props }) => {
    const item = props as unknown as SuggestionItem;
    if (item.kind !== "tag") return;
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        { type: "hashtag", attrs: { id: item.name, label: item.name } },
        { type: "text", text: " " },
      ])
      .run();
  },
  render: popupRenderer as unknown as SuggestionConfig["render"],
};

const Hashtag = Mention.extend({ name: "hashtag" });

export type RichEditorHandle = {
  focus: () => void;
  clear: () => void;
  setHtml: (html: string) => void;
  getHtml: () => string;
  insertText: (text: string) => void;
};

export const RichEditor = forwardRef<
  RichEditorHandle,
  {
    initialHtml?: string;
    placeholder: string;
    label: string;
    onChange?: (state: { html: string; text: string; empty: boolean }) => void;
    onSubmit?: () => void;
    onFocus?: () => void;
    autoFocus?: boolean;
    className?: string;
    editorClassName?: string;
    disabled?: boolean;
  }
>(function RichEditor(
  { initialHtml, placeholder, label, onChange, onSubmit, onFocus, autoFocus, className, editorClassName, disabled },
  ref,
) {
  const submitRef = useRef(onSubmit);
  const changeRef = useRef(onChange);
  const focusRef = useRef(onFocus);
  useEffect(() => {
    submitRef.current = onSubmit;
    changeRef.current = onChange;
    focusRef.current = onFocus;
  });

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    editable: !disabled,
    content: initialHtml || "",
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({ HTMLAttributes: { class: "rt-mention" }, suggestion: peopleSuggestion }),
      Hashtag.configure({ HTMLAttributes: { class: "rt-tag" }, suggestion: tagSuggestion }),
    ],
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
        class: cn(
          richTextClass,
          "min-h-[2.75rem] w-full outline-none [&_a]:text-primary [&_a]:underline",
          "[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
          editorClassName,
        ),
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          submitRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      changeRef.current?.({ html: current.getHTML(), text: current.getText(), empty: current.isEmpty });
    },
    onFocus: () => focusRef.current?.(),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.chain().focus("end").run(),
      clear: () => {
        editor?.commands.clearContent(true);
      },
      setHtml: (html) => {
        editor?.commands.setContent(html, { emitUpdate: true });
      },
      getHtml: () => (editor && !editor.isEmpty ? editor.getHTML() : ""),
      insertText: (text) => editor?.chain().focus().insertContent(text).run(),
    }),
    [editor],
  );

  return <EditorContent editor={editor} className={cn("w-full", className)} />;
});
