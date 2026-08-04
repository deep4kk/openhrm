import { cn } from "@/lib/utils";

/**
 * Every screen opens the same way: a title, an optional line explaining what
 * the screen is for, and actions on the right. Consistency here is what makes
 * an app with twenty screens feel like one product rather than twenty.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground measure mt-1 text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

/** Standard page frame: consistent max width and vertical rhythm. */
export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6", className)}>
      {children}
    </div>
  );
}

/**
 * Empty states carry weight in an HR tool — a new organisation sees a lot of
 * them on day one. Each says what is missing and offers the action that fixes
 * it, rather than showing a blank table.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="bg-muted text-muted-foreground mb-4 flex size-10 items-center justify-center rounded-lg">
          <Icon className="size-5" />
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="text-muted-foreground mt-1.5 max-w-sm text-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
