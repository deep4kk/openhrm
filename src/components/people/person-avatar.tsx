import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * A person, rendered consistently everywhere they appear.
 *
 * Initials rather than a generic silhouette: in a list of thirty people the
 * silhouette is noise, whereas "MJ" is a genuine recognition cue. The tint is
 * derived from the name so the same person keeps the same colour across every
 * screen without storing anything.
 */

const TINTS = [
  "bg-chart-1/12 text-chart-1",
  "bg-chart-2/12 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/12 text-chart-4",
  "bg-chart-5/12 text-chart-5",
];

function tintFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return TINTS[hash % TINTS.length]!;
}

export function initialsOf(first: string, last?: string | null): string {
  const a = first?.trim()[0] ?? "";
  const b = last?.trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export function PersonAvatar({
  firstName,
  lastName,
  avatarUrl,
  size = "md",
  className,
}: {
  firstName: string;
  lastName?: string | null;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "size-6 text-[10px]",
    sm: "size-7 text-[11px]",
    md: "size-8 text-xs",
    lg: "size-14 text-lg",
  };

  const name = `${firstName} ${lastName ?? ""}`.trim();

  return (
    <Avatar className={cn("rounded-md", sizes[size], className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback
        className={cn("rounded-md font-medium", tintFor(name))}
        aria-hidden="true"
      >
        {initialsOf(firstName, lastName)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Avatar + name + secondary line, the unit used in every table row. */
export function PersonCell({
  firstName,
  lastName,
  avatarUrl,
  secondary,
  size = "md",
}: {
  firstName: string;
  lastName?: string | null;
  avatarUrl?: string | null;
  secondary?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <div className="flex items-center gap-2.5">
      <PersonAvatar
        firstName={firstName}
        lastName={lastName}
        avatarUrl={avatarUrl}
        size={size}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {firstName} {lastName}
        </div>
        {secondary && (
          <div className="text-muted-foreground truncate text-xs">
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}
