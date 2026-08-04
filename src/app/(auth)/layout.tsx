import Link from "next/link";
import { Wordmark } from "@/components/brand";

/**
 * Two panels: the form gets the reading position, and the right panel says what
 * this thing is without shouting. Below `lg` the panel is dropped entirely
 * rather than stacked — on a phone it would just be noise above the fields.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <main className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-10 inline-flex">
            <Wordmark size={28} />
          </Link>
          {children}
        </div>
      </main>

      <aside className="bg-card hidden border-l lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div className="max-w-md">
          <p className="text-[22px] leading-[1.45] font-medium tracking-tight text-balance">
            Everything your people need, and nothing they don&apos;t.
          </p>
          <p className="text-muted-foreground measure mt-5 text-sm leading-relaxed">
            OpenHRM keeps your employee records, attendance and leave in one
            place — free, open source, and yours to host wherever you like.
          </p>

          <dl className="mt-12 space-y-0 text-sm">
            {[
              ["Employees", "One record per person, with the history"],
              ["Attendance", "Check in, correct mistakes, export the month"],
              ["Leave", "Balances that accrue, approvals that route"],
              ["Your data", "Export everything, any time, no lock-in"],
            ].map(([term, detail]) => (
              <div
                key={term}
                className="grid grid-cols-[7.5rem_1fr] gap-4 border-t py-3.5"
              >
                <dt className="text-foreground font-medium">{term}</dt>
                <dd className="text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
