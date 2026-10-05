import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/initials";

const SIZES = {
  xs: "size-6 text-[0.6rem]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  xl: "size-24 text-2xl",
} as const;

/**
 * A person's avatar. `version` busts the browser cache after they change it
 * (pass the profile's updatedAt). Falls back to initials.
 */
export function UserAvatar({
  userId,
  name,
  size = "md",
  version,
  className,
}: {
  userId: string;
  name: string;
  size?: keyof typeof SIZES;
  version?: string | number | Date;
  className?: string;
}) {
  const v = version ? `?v=${new Date(version).getTime() || version}` : "";
  return (
    <Avatar className={cn(SIZES[size], "shrink-0 ring-1 ring-border", className)}>
      <AvatarImage src={`/api/avatars/${userId}${v}`} alt="" className="object-cover" />
      <AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
