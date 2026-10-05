/**
 * Typography for user-written post/comment HTML (and the editor), scoped with
 * Tailwind arbitrary selectors so globals.css stays untouched. Classes
 * `rt-mention`, `rt-tag` and `rt-link` come from renderUserHtml / the editor.
 */
export const richTextClass = [
  "text-[0.95rem] leading-relaxed text-foreground/90 break-words [overflow-wrap:anywhere]",
  "[&_p]:my-0 [&_p+p]:mt-2.5 [&_p:empty]:h-3",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-brand-magenta/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_.rt-link]:font-medium [&_.rt-link]:text-primary [&_.rt-link]:underline [&_.rt-link]:decoration-primary/30 [&_.rt-link]:underline-offset-4 [&_.rt-link:hover]:decoration-primary",
  "[&_.rt-mention]:rounded-md [&_.rt-mention]:bg-secondary [&_.rt-mention]:px-1 [&_.rt-mention]:py-px [&_.rt-mention]:font-semibold [&_.rt-mention]:text-secondary-foreground [&_.rt-mention]:no-underline [&_a.rt-mention:hover]:bg-accent",
  "[&_.rt-tag]:font-semibold [&_.rt-tag]:text-brand-magenta [&_a.rt-tag:hover]:underline [&_a.rt-tag]:underline-offset-4",
].join(" ");
