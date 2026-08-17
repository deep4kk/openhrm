import type { Metadata } from "next";
import Link from "next/link";
import { Cake, PartyPopper, Plus } from "lucide-react";

import { requireAuth, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import {
  listAnnouncements,
  listSurveys,
  upcomingCelebrations,
} from "@/lib/queries/engagement";
import { formatDateShort, formatRelative } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { PersonCell } from "@/components/people/person-avatar";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/link-button";
import {
  AnnouncementDialog,
  AnnouncementFeed,
} from "@/components/engagement/announcement-feed";

export const metadata: Metadata = { title: "Engagement" };

/**
 * The company wall.
 *
 * Feed on the left, the human stuff on the right: whose birthday is coming up,
 * who has been here five years, and which surveys are open. None of it is
 * load-bearing for HR operations, and all of it is why people open the app on a
 * day they have no leave to book.
 */
export default async function EngagementPage() {
  const session = await requireAuth();

  const mayManageAnnouncements = can(session, "announcement.manage");
  const mayManageSurveys = can(session, "survey.manage");

  const [announcements, surveys, celebrations, departments, locations] =
    await Promise.all([
      listAnnouncements(session),
      listSurveys(session),
      upcomingCelebrations(session),
      mayManageAnnouncements
        ? orgDb(session.org.id).department.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      mayManageAnnouncements
        ? orgDb(session.org.id).location.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

  const openSurveys = surveys.filter((s) => s.status === "OPEN");

  return (
    <PageShell>
      <PageHeader
        title="Engagement"
        description="Company news, polls and the dates worth remembering."
        actions={
          <>
            {mayManageSurveys && (
              <LinkButton href="/engagement/surveys/new" variant="outline">
                <Plus className="size-4" aria-hidden />
                New survey
              </LinkButton>
            )}
            {mayManageAnnouncements && (
              <AnnouncementDialog
                departments={departments}
                locations={locations}
              />
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div>
          <AnnouncementFeed
            canManage={mayManageAnnouncements}
            departments={departments}
            locations={locations}
            announcements={announcements.map((announcement) => {
              const counts = new Map<string, number>();
              for (const reaction of announcement.reactions) {
                counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
              }

              return {
                id: announcement.id,
                title: announcement.title,
                body: announcement.body,
                audience: announcement.audience,
                audienceLabel:
                  announcement.audience === "ALL"
                    ? null
                    : (announcement.department?.name ??
                      announcement.location?.name ??
                      null),
                isPinned: announcement.isPinned,
                authorName: announcement.author?.name ?? null,
                publishedLabel: formatRelative(announcement.publishedAt),
                reactions: Array.from(counts.entries()).map(([emoji, count]) => ({
                  emoji,
                  count,
                })),
                myReaction:
                  announcement.reactions.find((r) => r.userId === session.user.id)
                    ?.emoji ?? null,
                departmentId: announcement.departmentId,
                locationId: announcement.locationId,
              };
            })}
          />
        </div>

        <aside className="space-y-4">
          {(openSurveys.length > 0 || mayManageSurveys) && (
            <section className="surface p-4">
              <h2 className="mb-3 text-sm font-semibold">
                Surveys
                {surveys.length > 0 && (
                  <span className="text-muted-foreground ml-2 font-normal tabular-nums">
                    {surveys.length}
                  </span>
                )}
              </h2>

              {surveys.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing running.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {surveys.map((survey) => (
                    <li key={survey.id}>
                      <Link
                        href={`/engagement/surveys/${survey.id}`}
                        className="hover:bg-muted/50 -mx-2 block rounded-md px-2 py-1.5 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm">{survey.title}</p>
                          {survey.status === "OPEN" ? (
                            <StatusBadge label="Open" tone="positive" />
                          ) : survey.status === "DRAFT" ? (
                            <StatusBadge label="Draft" tone="neutral" />
                          ) : (
                            <StatusBadge label="Closed" tone="neutral" />
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {survey.kind === "ENPS"
                            ? "eNPS pulse"
                            : survey.kind === "POLL"
                              ? "Poll"
                              : "Survey"}
                          {" · "}
                          {survey._count.responses} response
                          {survey._count.responses === 1 ? "" : "s"}
                          {Array.isArray(survey.responses) &&
                            survey.responses.length > 0 &&
                            " · you answered"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {celebrations.birthdays.length > 0 && (
            <section className="surface p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                <Cake className="size-4" aria-hidden />
                Birthdays
              </h2>
              <ul className="space-y-2.5">
                {celebrations.birthdays.slice(0, 6).map(({ employee, on }) => (
                  <li
                    key={employee.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <PersonCell
                      firstName={employee.firstName}
                      lastName={employee.lastName}
                      avatarUrl={employee.avatarUrl}
                      size="xs"
                    />
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatDateShort(on)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {celebrations.anniversaries.length > 0 && (
            <section className="surface p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                <PartyPopper className="size-4" aria-hidden />
                Work anniversaries
              </h2>
              <ul className="space-y-2.5">
                {celebrations.anniversaries
                  .slice(0, 6)
                  .map(({ employee, on, years }) => (
                    <li
                      key={employee.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <PersonCell
                        firstName={employee.firstName}
                        lastName={employee.lastName}
                        avatarUrl={employee.avatarUrl}
                        secondary={`${years} year${years === 1 ? "" : "s"}`}
                        size="xs"
                      />
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {formatDateShort(on)}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </PageShell>
  );
}
