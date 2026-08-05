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
  children,
  ...props
}: React.ComponentProps<typeof Button> & { href: string }) {
  return (
    <Button {...props} nativeButton={false} render={<Link href={href} />}>
      {children}
    </Button>
  );
}
