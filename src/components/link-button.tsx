import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * A button that is actually a link.
 *
 * Base UI's Button assumes it renders a native <button> and warns (correctly)
 * when it doesn't, because an anchor and a button behave differently for
 * keyboard users, middle-click, and "open in new tab". Setting
 * `nativeButton={false}` tells it we meant an anchor and keeps the right
 * semantics. Centralised here so no call site has to remember.
 */
export function LinkButton({
  href,
  target,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  href: string;
  /** For the few links that genuinely leave the app — the public careers page. */
  target?: React.HTMLAttributeAnchorTarget;
}) {
  return (
    <Button
      {...props}
      nativeButton={false}
      render={
        <Link
          href={href}
          target={target}
          // Any new tab we open gets noopener: the opened page must not be able
          // to reach back through window.opener.
          rel={target === "_blank" ? "noopener noreferrer" : undefined}
        />
      }
    >
      {children}
    </Button>
  );
}
