import { cn } from "@/lib/utils";

/**
 * A lifecycle, drawn as steps.
 *
 * Deliberately CSS and text rather than an image: it stays readable at any zoom,
 * responds to light/dark, is selectable and searchable, and a screen reader gets
 * an ordered list instead of "diagram".
 */
export function Flow({
  steps,
  className,
}: {
  steps: { title: string; detail: string; actor?: string }[];
  className?: string;
}) {
  return (
    <ol className={cn("relative space-y-0", className)}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={step.title} className="relative flex gap-4 pb-5 last:pb-0">
            {/* Connector */}
            {!last && (
              <span
                className="bg-border absolute top-7 left-[13px] h-[calc(100%-1rem)] w-px"
                aria-hidden="true"
              />
            )}

            <span
              className="bg-card text-muted-foreground relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums"
              aria-hidden="true"
            >
              {index + 1}
            </span>

            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-medium">
                {step.title}
                {step.actor && (
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {step.actor}
                  </span>
                )}
              </p>
              <p className="text-muted-foreground measure mt-1 text-sm leading-relaxed">
                {step.detail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A labelled block of technical detail, visually subordinate to the prose. */
export function TechNote({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 mt-4 rounded-lg border p-4">
      <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
        {title}
      </p>
      <div className="measure space-y-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/** Inline code that doesn't shout. */
export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.8em]">
      {children}
    </code>
  );
}
