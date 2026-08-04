import { cn } from "@/lib/utils";

/**
 * The mark: one node above two, connected — an org chart reduced to its
 * smallest legible form. It reads at 16px in a sidebar and at 40px on the login
 * screen, which is the only real constraint a product mark has to meet.
 */
export function Logo({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="24" height="24" rx="6" className="fill-primary" />
      <circle cx="12" cy="7.5" r="2.25" className="fill-primary-foreground" />
      <circle cx="7" cy="16.5" r="2.25" className="fill-primary-foreground" />
      <circle cx="17" cy="16.5" r="2.25" className="fill-primary-foreground" />
      <path
        d="M12 9.75v2.25a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 0 7 15v-.75M12 9.75v2.25a1.5 1.5 0 0 0 1.5 1.5h2A1.5 1.5 0 0 1 17 15v-.75"
        className="stroke-primary-foreground"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  size = 24,
  showTagline = false,
}: {
  className?: string;
  size?: number;
  showTagline?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo size={size} />
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">
          OpenHRM
        </div>
        {showTagline && (
          <div className="text-muted-foreground mt-1 text-xs">
            Open-source HR
          </div>
        )}
      </div>
    </div>
  );
}
