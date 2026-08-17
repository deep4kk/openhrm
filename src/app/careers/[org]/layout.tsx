import { notFound } from "next/navigation";
import Link from "next/link";

import { publicOrgBySlug } from "@/lib/queries/hiring";
import { Logo } from "@/components/brand";

/**
 * The public careers site.
 *
 * Outside the (app) group entirely: no session, no sidebar, no notification
 * bell. A candidate is not a user of this product and should never be shown its
 * chrome — and putting these routes under their own layout means a missing
 * auth check here cannot accidentally inherit one from the app shell.
 *
 * The organisation's brand colour is injected as a CSS custom property so a
 * self-hosted install's careers page looks like theirs (PRD §8.29), without a
 * rebuild and without letting arbitrary CSS through: the value is validated as
 * an OKLCH triple before it is written.
 */
export default async function CareersLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const org = await publicOrgBySlug(slug);
  if (!org) notFound();

  const brand = safeOklch(org.brandColor);

  return (
    <div
      className="bg-background min-h-svh"
      style={brand ? ({ "--primary": `oklch(${brand})` } as React.CSSProperties) : undefined}
    >
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link
            href={`/careers/${org.slug}`}
            className="focus-visible:ring-ring flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3"
          >
            {org.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URI
              // on the organisation row; Next's optimiser has nothing to do here.
              <img src={org.logoUrl} alt="" className="size-8 rounded-md object-contain" />
            ) : (
              <Logo size={32} />
            )}
            <span className="font-semibold tracking-tight">{org.name}</span>
          </Link>

          {org.website && (
            <a
              href={org.website}
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Company site
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</main>

      <footer className="text-muted-foreground border-t px-4 py-6 text-center text-xs">
        Careers at {org.name} · powered by{" "}
        <a
          href="https://github.com/"
          className="underline-offset-4 hover:underline"
          rel="noreferrer noopener"
        >
          OpenHRM
        </a>
      </footer>
    </div>
  );
}

/**
 * Only an `L C H` triple gets through, so the value cannot close the
 * declaration and inject rules of its own.
 */
function safeOklch(value: string | null): string | null {
  if (!value) return null;
  return /^[\d.]+\s+[\d.]+\s+[\d.]+$/.test(value.trim()) ? value.trim() : null;
}
