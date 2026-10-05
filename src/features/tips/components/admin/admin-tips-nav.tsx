"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/content/tips", label: "All tips" },
  { href: "/admin/content/tips/schedule", label: "Schedule" },
  { href: "/admin/content/tips/topics", label: "Topics & categories" },
];

export function AdminTipsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Thrive Tips sections" className="mb-5 border-b">
      <ul className="-mb-px flex gap-5 overflow-x-auto">
        {LINKS.map((link) => {
          const active = link.href === "/admin/content/tips" ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center border-b-2 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
