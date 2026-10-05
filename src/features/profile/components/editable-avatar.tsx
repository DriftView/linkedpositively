"use client";

import { Camera } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";
import { AvatarStudio } from "./avatar-studio";

/** Your big profile picture with a camera button that opens the avatar studio. */
export function EditableAvatar(props: {
  userId: string;
  name: string;
  level: number;
  points: number;
  avatarId: string | null;
  hasPhoto: boolean;
  version: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [state, setState] = useState({ avatarId: props.avatarId, hasPhoto: props.hasPhoto, version: props.version });
  const src = `/api/avatars/${props.userId}?v=${encodeURIComponent(state.version ?? "0")}`;
  const hasPicture = state.hasPhoto || Boolean(state.avatarId);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSession((value) => value + 1);
          setOpen(true);
        }}
        className="group relative block rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        aria-label="Change your picture"
      >
        <Avatar className="size-28 bg-card shadow-lift ring-4 ring-background sm:size-32">
          {hasPicture ? <AvatarImage key={src} src={src} alt="" className="object-cover" /> : null}
          <AvatarFallback className="bg-secondary text-3xl font-semibold text-secondary-foreground">
            {initials(props.name)}
          </AvatarFallback>
        </Avatar>
        <span className="absolute right-0.5 bottom-0.5 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift ring-4 ring-background transition-transform group-hover:scale-105 group-active:scale-95">
          <Camera className="size-4.5" aria-hidden />
        </span>
      </button>
      <AvatarStudio
        key={session}
        open={open}
        onOpenChange={setOpen}
        userId={props.userId}
        name={props.name}
        level={props.level}
        points={props.points}
        avatarId={state.avatarId}
        hasPhoto={state.hasPhoto}
        version={state.version}
        onSaved={(update) =>
          setState((current) => ({
            avatarId: update.avatarId === undefined ? current.avatarId : update.avatarId,
            hasPhoto: update.hasPhoto,
            version: update.version,
          }))
        }
      />
    </>
  );
}
