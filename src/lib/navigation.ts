import type { PermissionKey } from "./permissions";
import type { AuthContext } from "./auth";

/**
 * Icons are named, not imported.
 *
 * This module is evaluated on the server and its output crosses into a client
 * component. React cannot serialise a function across that boundary, so passing
 * the Lucide component itself fails at runtime. The client sidebar maps these
 * names back to components.
 */
export type NavIcon =
  | "home"
  | "user"
  | "people"
  | "clock"
  | "calendar"
  | "chart"
  | "settings"
  | "help"
  | "wallet"
  | "clipboard"
  | "files"
  | "laptop"
  | "receipt"
  | "lifebuoy"
  | "briefcase"
  | "target"
  | "graduation"
  | "megaphone"
  | "doorOpen";

/**
 * Navigation is derived from permissions, not from role names.
 *
 * A destination appears only when the viewer holds at least one of `anyOf`.
 * This keeps the sidebar honest — nothing is shown that would 403 on click —
 * and it means a custom role composed by an Org Admin gets a correct sidebar
 * without anyone updating this file.
 *
 * Hiding a link is a courtesy, never a security control: every page behind
 * these links calls requirePermission() on the server regardless.
 */

export interface NavItem {
  title: string;
  href: string;
  icon: NavIcon;
  /** Visible when the viewer holds any of these. Omitted = always visible. */
  anyOf?: PermissionKey[];
  /** Match nested routes (/people/abc123 highlights /people). */
  exact?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { title: "Home", href: "/dashboard", icon: "home", exact: true },
      { title: "My space", href: "/me", icon: "user" },
    ],
  },
  {
    label: "Manage",
    items: [
      {
        title: "People",
        href: "/people",
        icon: "people",
        anyOf: ["employee.read.all", "employee.read.team", "directory.read"],
      },
      {
        title: "Attendance",
        href: "/attendance",
        icon: "clock",
        anyOf: ["attendance.read.all", "attendance.read.team"],
      },
      {
        title: "Leave",
        href: "/leave",
        icon: "calendar",
        anyOf: ["leave.read.all", "leave.read.team", "leave.approve.team"],
      },
      {
        title: "Payroll",
        href: "/payroll",
        icon: "wallet",
        anyOf: ["payroll.read.all", "payroll.run", "payroll.structure.manage"],
      },
      {
        title: "Reports",
        href: "/reports",
        icon: "chart",
        anyOf: ["report.read.org", "report.read.team"],
      },
    ],
  },
  {
    label: "Workplace",
    items: [
      {
        title: "Onboarding",
        href: "/journeys",
        icon: "clipboard",
        anyOf: ["journey.read.all", "journey.manage"],
      },
      {
        // /documents is the letter generator. `letter.manage` is what every
        // screen behind it requires, so it is what gates the link — listing a
        // wider set here would put the entry in front of people who would be
        // bounced to /denied on click.
        title: "Documents",
        href: "/documents",
        icon: "files",
        anyOf: ["letter.manage"],
      },
      {
        title: "Assets",
        href: "/assets",
        icon: "laptop",
        anyOf: ["asset.read.all", "asset.manage"],
      },
      {
        title: "Expenses",
        href: "/expenses",
        icon: "receipt",
        anyOf: [
          "expense.read.all",
          "expense.read.team",
          "expense.approve.team",
          "expense.approve.all",
        ],
      },
      {
        title: "Helpdesk",
        href: "/helpdesk",
        icon: "lifebuoy",
        anyOf: ["ticket.read.all", "ticket.manage"],
      },
      {
        title: "Exits",
        href: "/exits",
        icon: "doorOpen",
        anyOf: ["exit.read.all", "exit.manage", "settlement.manage"],
      },
    ],
  },
  {
    label: "Talent",
    items: [
      {
        title: "Hiring",
        href: "/hiring",
        icon: "briefcase",
        anyOf: ["job.read", "job.manage", "candidate.read"],
      },
      {
        title: "Performance",
        href: "/performance",
        icon: "target",
        anyOf: [
          "goal.read.all",
          "goal.read.team",
          "goal.manage",
          "review.cycle.manage",
          "review.read.team",
        ],
      },
      {
        title: "Learning",
        href: "/learning",
        icon: "graduation",
        anyOf: ["course.manage", "enrollment.manage", "enrollment.read.all"],
      },
      {
        title: "Engagement",
        href: "/engagement",
        icon: "megaphone",
        anyOf: ["announcement.manage", "survey.manage"],
      },
    ],
  },
  {
    label: "Organisation",
    items: [
      {
        title: "Settings",
        href: "/settings",
        icon: "settings",
        anyOf: [
          "org.read",
          "org.update",
          "structure.manage",
          "role.manage",
          "leave.type.manage",
          "branding.manage",
          "apikey.manage",
          "webhook.manage",
        ],
      },
      { title: "About", href: "/about", icon: "help" },
    ],
  },
];

export function visibleSections(session: AuthContext): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => isVisible(item, session)),
  })).filter((section) => section.items.length > 0);
}

function isVisible(item: NavItem, session: AuthContext): boolean {
  if (!item.anyOf) return true;
  return item.anyOf.some((key) => session.role.permissions.includes(key));
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Where a user lands after signing in.
 *
 * PRD §8.1 requires each teammate to "land on a role-appropriate dashboard".
 * An employee with no management permissions gets their own space, because an
 * org-wide dashboard they can't read would be an empty page.
 */
export function landingRoute(session: AuthContext): string {
  const canSeeOrgView = [
    "report.read.org",
    "report.read.team",
    "employee.read.all",
    "employee.read.team",
    "leave.approve.team",
  ].some((key) => session.role.permissions.includes(key));

  return canSeeOrgView ? "/dashboard" : "/me";
}
