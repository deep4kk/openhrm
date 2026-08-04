import { requireAuth } from "@/lib/auth";
import { visibleSections } from "@/lib/navigation";
import { recentNotifications, unreadCount } from "@/lib/notifications";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { UserMenu } from "@/components/app-shell/user-menu";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  const [notifications, unread] = await Promise.all([
    recentNotifications(session.user.id),
    unreadCount(session.user.id),
  ]);

  const displayName =
    session.employee?.displayName ??
    (session.employee
      ? `${session.employee.firstName} ${session.employee.lastName}`.trim()
      : session.user.name);

  return (
    <SidebarProvider>
      <AppSidebar
        sections={visibleSections(session)}
        orgName={session.org.name}
        orgLogoUrl={session.org.logoUrl}
        footer={
          <SidebarMenu>
            <SidebarMenuItem>
              <UserMenu
                name={displayName}
                email={session.user.email}
                roleName={session.role.name}
                avatarUrl={session.employee?.avatarUrl ?? null}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        }
      />

      <SidebarInset className="min-w-0">
        {/* Sticky so the primary controls stay reachable on long tables. */}
        <header className="bg-background/85 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur-sm sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          <NotificationBell
            unread={unread}
            items={notifications.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              linkUrl: n.linkUrl,
              readAt: n.readAt?.toISOString() ?? null,
              createdAt: n.createdAt.toISOString(),
            }))}
          />
        </header>

        {/* Focus lands here on route change, so keyboard and screen-reader
            users don't start each page from the top of the sidebar. */}
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
