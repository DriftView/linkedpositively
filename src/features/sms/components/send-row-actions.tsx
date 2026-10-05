"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { RotateCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmAction } from "@/features/admin/components/bits";
import { runAction } from "@/features/admin/components/run-action";
import { cancelSendAction, resendAction } from "../actions";
import type { SendStatus } from "../types";
import { flagLabel } from "./send-status";

const OUTCOME: Record<string, string> = {
  sent: "Text sent",
  failed: "The text failed again — check the number",
  skipped: "Skipped — see the reason in the log",
  cancelled: "Not sent — this person can't receive texts right now",
};

/** "Send now" for failed/skipped/cancelled texts and "Cancel" for upcoming ones. */
function SendRowActionsInner({ id, flag, status, name }: { id: string; flag: string; status: SendStatus; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (status === "scheduled") {
    return (
      <ConfirmAction
        trigger={
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={`Cancel ${flagLabel(flag)} text`}>
            <X />
          </Button>
        }
        destructive
        title={`Cancel the ${flagLabel(flag).toLowerCase()} text?`}
        description={<p>{name} won&apos;t get this message. Other weeks are unaffected.</p>}
        confirmLabel="Cancel text"
        onConfirm={async () => {
          const data = await runAction(cancelSendAction({ sendId: id }), "Text cancelled");
          if (!data) return false;
          router.refresh();
        }}
      />
    );
  }
  if (status === "failed" || status === "skipped" || status === "cancelled") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Send the ${flagLabel(flag)} text now`}
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const data = await runAction(resendAction({ sendId: id }));
              setPending(false);
              if (data) {
                const message = OUTCOME[data.outcome] ?? "Done";
                if (data.outcome === "sent") toast.success(message);
                else toast.warning(message);
                router.refresh();
              }
            }}
          >
            {pending ? <Spinner /> : status === "failed" ? <RotateCw /> : <Send />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{status === "failed" ? "Try again" : "Send now"}</TooltipContent>
      </Tooltip>
    );
  }
  return null;
}

/** Row actions; clicks don't toggle a surrounding <details>. */
export function SendRowActions(props: { id: string; flag: string; status: SendStatus; name: string }) {
  return (
    <span className="inline-flex" onClick={(event) => event.preventDefault()}>
      <SendRowActionsInner {...props} />
    </span>
  );
}
