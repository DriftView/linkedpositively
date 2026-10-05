"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, EyeOff, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { actionError } from "@/features/resources/client";
import { reorderJourneyAction } from "../../admin-actions";
import { ACCENTS } from "../../lib";
import type { CategoryDTO } from "../../queries";
import { CategoryDialog } from "./category-dialog";

/** Journey areas, in the order members see them. */
export function CategoryList({ categories }: { categories: CategoryDTO[] }) {
  const router = useRouter();
  const [items, setItems] = useState(categories);
  const [, startTransition] = useTransition();

  function move(index: number, delta: number) {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setItems(next);
    startTransition(async () => {
      const result = await reorderJourneyAction({ kind: "category", ids: next.map((category) => category.id) });
      const error = actionError(result);
      if (error) {
        toast.error(error);
        setItems(items);
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <CategoryDialog
          onSaved={(id) => router.push(`/admin/content/journey/${id}`)}
          trigger={
            <Button>
              <Plus /> New area
            </Button>
          }
        />
      </div>
      <ul className="grid gap-2">
        {items.map((category, index) => (
          <li key={category.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 pl-4">
            <span aria-hidden className={cn("h-10 w-1.5 shrink-0 rounded-full", ACCENTS[category.accent].bar)} />
            <Link href={`/admin/content/journey/${category.id}`} className="group min-w-0 flex-1">
              <span className="flex items-center gap-2 font-medium group-hover:text-primary">
                {category.name}
                {!category.published ? (
                  <Badge variant="outline" className="font-normal">
                    <EyeOff /> Hidden
                  </Badge>
                ) : null}
              </span>
              <span className="block text-sm text-muted-foreground">
                {category.methodCount} {category.methodCount === 1 ? "method" : "methods"} · {category.goalCount} goal ideas
              </span>
            </Link>
            <div className="flex items-center">
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${category.name} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${category.name} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon-sm" asChild>
                <Link href={`/admin/content/journey/${category.id}`} aria-label={`Edit ${category.name}`}>
                  <ChevronRight />
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
