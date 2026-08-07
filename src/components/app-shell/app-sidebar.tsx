"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Clock,
  Cog,
  DoorOpen,
  Files,
  GraduationCap,
  HelpCircle,
  Laptop,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Receipt,
  Target,
  Users,
  UserRound,
  Wallet,
} from "lucide-react";

import { Logo } from "@/components/brand";
import { isActive, type NavIcon, type NavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Names arrive from the server; the components live here on the client. */
const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  home: LayoutDashboard,
  user: UserRound,
  people: Users,
  clock: Clock,
  calendar: CalendarDays,
  chart: BarChart3,
  settings: Cog,
  help: HelpCircle,
  wallet: Wallet,
  clipboard: ClipboardList,
  files: Files,
  laptop: Laptop,
  receipt: Receipt,
  lifebuoy: LifeBuoy,
  briefcase: Briefcase,
  target: Target,
  graduation: GraduationCap,
  megaphone: Megaphone,
  doorOpen: DoorOpen,
};

export function AppSidebar({
  sections,
  orgName,
  orgLogoUrl,
  footer,
}: {
  sections: NavSection[];
  orgName: string;
  orgLogoUrl: string | null;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="h-14 justify-center border-b px-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 overflow-hidden"
        >
          {orgLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogoUrl}
              alt=""
              className="size-6 shrink-0 rounded object-cover"
            />
          ) : (
            <Logo size={24} />
          )}
          <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            {orgName}
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {sections.map((section, index) => (
          <SidebarGroup key={section.label ?? index} className="p-0 pb-1">
            {section.label && (
              <SidebarGroupLabel className="text-muted-foreground/70 px-2 text-[11px] font-medium tracking-wide uppercase">
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = ICONS[item.icon];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.title}
                        render={<Link href={item.href} />}
                      >
                        <Icon
                          className={cn(
                            "size-4",
                            active
                              ? "text-sidebar-primary"
                              : "text-muted-foreground",
                          )}
                          aria-hidden="true"
                        />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t p-2">{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
