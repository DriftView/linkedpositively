"use client";

import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const COMMON = [
  ["America/New_York", "Eastern Time"],
  ["America/Chicago", "Central Time"],
  ["America/Denver", "Mountain Time"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific Time"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Puerto_Rico", "Atlantic Time (Puerto Rico)"],
] as const;

function offsetLabel(zone: string) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((item) => item.type === "timeZoneName");
    return part?.value.replace("GMT", "UTC") ?? "";
  } catch {
    return "";
  }
}

export function timezoneLabel(zone: string) {
  const common = COMMON.find(([id]) => id === zone);
  return common ? common[1] : zone.replace(/_/g, " ").replace(/\//g, " / ");
}

/** Searchable timezone list with the US zones first. */
export function TimezonePicker({ id, value, onChange }: { id: string; value: string; onChange: (zone: string) => void }) {
  const [open, setOpen] = useState(false);
  const all = useMemo(() => {
    const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    const common = new Set(COMMON.map(([zone]) => zone as string));
    return zones.filter((zone) => !common.has(zone));
  }, []);

  function select(zone: string) {
    onChange(zone);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-11 w-full justify-between rounded-xl px-3 font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Globe className="text-muted-foreground" />
            <span className="truncate">{timezoneLabel(value)}</span>
            <span className="text-xs text-muted-foreground">{offsetLabel(value)}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search a city or region…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup heading="United States">
              {COMMON.map(([zone, label]) => (
                <CommandItem key={zone} value={`${label} ${zone}`} onSelect={() => select(zone)}>
                  <Check className={cn("size-4", value === zone ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1">{label}</span>
                  <span className="text-xs text-muted-foreground">{offsetLabel(zone)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Everywhere">
              {all.map((zone) => (
                <CommandItem key={zone} value={zone} onSelect={() => select(zone)}>
                  <Check className={cn("size-4", value === zone ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{zone.replace(/_/g, " ")}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
