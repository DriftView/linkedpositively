"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

/** Opens a search box (also on Ctrl/⌘+K) that runs a site-wide search. */
export function SearchButton({ action = "/search" }: { action?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setOpen(false);
    router.push(`${action}?q=${encodeURIComponent(term)}`);
  }

  return (
    <>
      <Button variant="ghost" size="icon-lg" className="rounded-full" onClick={() => setOpen(true)} aria-label="Search">
        <Search className="size-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Search posts, tips and resources</DialogDescription>
          <form onSubmit={submit} className="flex items-center gap-3 px-4">
            <Search className="size-5 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posts, tips and resources…"
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              aria-label="Search"
              enterKeyHint="search"
            />
            <Kbd className="hidden sm:inline-flex">Enter</Kbd>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
