"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Bell, MessageSquareText, Smartphone } from "lucide-react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TIME_SLOTS, WEEKDAYS, WEEKDAYS_SHORT } from "../schedule";
import type { ReminderSchedule } from "../types";
import { Segmented } from "./segmented";

export type SmsStatus = { hasPhone: boolean; optedOut: boolean };

/** Whether this schedule can be saved (texts need a phone number). */
export function smsBlocked(value: ReminderSchedule, sms: SmsStatus) {
  return value.enabled && value.channel === "sms" && (!sms.hasPhone || sms.optedOut);
}

function zoneLabel(timezone: string) {
  return timezone.split("/").pop()?.replace(/_/g, " ") ?? timezone;
}

/**
 * The reminder settings fields: channel, daily/weekly + weekday, time and
 * (for personal trackers) the reminder's wording. Controlled.
 */
export function ReminderFields({
  value,
  onChange,
  sms,
  timezone,
  textPlaceholder,
}: {
  value: ReminderSchedule;
  onChange: (value: ReminderSchedule) => void;
  sms: SmsStatus;
  timezone: string;
  /** When set, shows the "What should it say?" field. */
  textPlaceholder?: string;
}) {
  const id = useId();
  const set = (patch: Partial<ReminderSchedule>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-6">
      <div className="space-y-2.5">
        <p className="text-sm font-medium" id={`${id}-channel`}>
          How should we remind you?
        </p>
        <Segmented
          label="How should we remind you?"
          value={value.channel}
          onValueChange={(channel) => set({ channel })}
          options={[
            { value: "sms", label: "Text message", icon: <Smartphone /> },
            { value: "in_app", label: "In the app", icon: <Bell /> },
          ]}
        />
        <AnimatePresence initial={false}>
          {value.channel === "sms" && (!sms.hasPhone || sms.optedOut) ? (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <span className="mt-1 flex gap-2 rounded-xl bg-warning/15 px-3 py-2.5 text-sm text-foreground dark:bg-warning/10">
                <MessageSquareText className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden />
                {sms.optedOut ? (
                  <span>You&apos;ve turned off text messages from us. Choose in-app reminders instead.</span>
                ) : (
                  <span>
                    We need your mobile number to text you.{" "}
                    <Link href="/profile" className="font-medium text-primary underline underline-offset-4">
                      Add it to your profile
                    </Link>
                    , or choose in-app reminders.
                  </span>
                )}
              </span>
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="space-y-2.5">
        <p className="text-sm font-medium">How often?</p>
        <Segmented
          label="How often?"
          value={value.frequency}
          onValueChange={(frequency) => set({ frequency })}
          options={[
            { value: "daily", label: "Every day" },
            { value: "weekly", label: "Once a week" },
          ]}
        />
        <AnimatePresence initial={false}>
          {value.frequency === "weekly" ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <ToggleGroupPrimitive.Root
                type="single"
                aria-label="Day of the week"
                value={String(value.weekday)}
                onValueChange={(next) => {
                  if (next) set({ weekday: Number(next) });
                }}
                className="flex justify-between gap-1 pt-2 sm:justify-start sm:gap-1.5"
              >
                {WEEKDAYS.map((name, index) => (
                  <ToggleGroupPrimitive.Item
                    key={name}
                    value={String(index)}
                    aria-label={name}
                    className={cn(
                      "grid size-10 place-items-center rounded-full text-[0.8rem] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      value.weekday === index ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {WEEKDAYS_SHORT[index].slice(0, 2)}
                  </ToggleGroupPrimitive.Item>
                ))}
              </ToggleGroupPrimitive.Root>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="space-y-2.5">
        <Label htmlFor={`${id}-time`}>What time?</Label>
        <Select
          value={`${value.hour}:${value.minute}`}
          onValueChange={(next) => {
            const slot = TIME_SLOTS.find((item) => item.value === next);
            if (slot) set({ hour: slot.hour, minute: slot.minute });
          }}
        >
          <SelectTrigger id={`${id}-time`} className="h-11 w-full rounded-xl sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {TIME_SLOTS.map((slot) => (
              <SelectItem key={slot.value} value={slot.value}>
                {slot.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">In your time zone ({zoneLabel(timezone)}).</p>
      </div>

      {textPlaceholder !== undefined ? (
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor={`${id}-text`}>What should it say?</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{(value.text ?? "").length}/140</span>
          </div>
          <Input
            id={`${id}-text`}
            value={value.text ?? ""}
            maxLength={140}
            placeholder={textPlaceholder}
            onChange={(event) => set({ text: event.target.value })}
            className="h-11 rounded-xl"
          />
          <p className="text-xs text-muted-foreground">Leave it blank to use the question above.</p>
        </div>
      ) : null}
    </div>
  );
}
