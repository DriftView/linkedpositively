"use client";

import { useState } from "react";
import { Eye, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { stopImpersonatingAction } from "../actions";

/**
 * "Viewing as" bar for both shells while an administrator is impersonating
 * someone (Better Auth impersonation; legacy Masquerade). Render it at the
 * very top of ParticipantShell and StaffShell when `user.impersonating`.
 */
export function ImpersonationBanner({ name }: { name: string }) {
  const [pending, setPending] = useState(false);
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-foreground px-4 py-1.5 text-sm text-background"
    >
      <Eye className="size-4 shrink-0" aria-hidden />
      <span>
        You&apos;re viewing the app as <strong className="font-semibold">{name}</strong>. Everything you do happens as them.
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="h-7 rounded-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await stopImpersonatingAction();
          window.location.assign(result?.data?.destination ?? "/admin");
        }}
      >
        {pending ? <Spinner /> : <LogOut />} Stop viewing
      </Button>
    </div>
  );
}
