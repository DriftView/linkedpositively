"use client";

import { Mail, MessageSquareText, Phone, Voicemail } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { METHODS_OF_CONTACT } from "../curriculum";

const ICONS = { voice: Phone, voicemail: Voicemail, sms: MessageSquareText, email: Mail } as const;

/** Method of contact (Voice / Voicemail / SMS / Email) as a segmented control. */
export function MethodPicker({
  value,
  onChange,
  labelledBy,
  invalid,
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  labelledBy: string;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={value ?? ""}
      onValueChange={(next) => onChange(next || null)}
      aria-labelledby={labelledBy}
      aria-invalid={invalid || undefined}
      className={cn("flex-wrap", invalid && "rounded-lg ring-2 ring-destructive/40", className)}
    >
      {METHODS_OF_CONTACT.map((method) => {
        const Icon = ICONS[method.key];
        return (
          <ToggleGroupItem
            key={method.key}
            value={method.key}
            className="h-9 gap-1.5 px-3 data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground"
          >
            <Icon aria-hidden className="size-4" />
            {method.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

export function MethodIcon({ method, className }: { method: string | null; className?: string }) {
  const Icon = method && method in ICONS ? ICONS[method as keyof typeof ICONS] : null;
  return Icon ? <Icon aria-hidden className={className} /> : null;
}
