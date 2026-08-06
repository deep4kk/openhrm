import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The settings vocabulary: a panel, a read-only field, and the link that turns
 * a panel on the overview into its own editing screen. Shared so the overview
 * and the six editors stay visually identical rather than drifting apart.
 */

type Icon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export function Panel({
  icon: Icon,
  title,
  count,
  description,
  action,
  children,
  className,
}: {
  icon?: Icon;
  title: string;
  count?: number;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {Icon && (
            <Icon className="text-muted-foreground mt-0.5 size-4" aria-hidden />
          )}
          <div>
            <h2 className="text-sm font-semibold">
              {title}
              {count !== undefined && (
                <span className="text-muted-foreground ml-2 font-normal tabular-nums">
                  {count}
                </span>
              )}
            </h2>
            {description && (
              <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn("mt-1 text-sm", mono && "font-mono text-xs")}>
        {value || "—"}
      </dd>
    </div>
  );
}

/**
 * "Manage" affordance on an overview panel.
 *
 * Rendered only when the viewer holds the permission the destination requires,
 * so the overview never offers a door that opens onto /denied.
 */
export function ManageLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-md text-xs font-medium transition-colors outline-none focus-visible:ring-3"
    >
      {label}
      <ChevronRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/** Back to the overview, at the top of every settings sub-page. */
export function BackToSettings() {
  return (
    <Link
      href="/settings"
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-1 inline-flex items-center gap-1 rounded-md text-sm transition-colors outline-none focus-visible:ring-3"
    >
      <ChevronLeft className="size-4" aria-hidden />
      Settings
    </Link>
  );
}
