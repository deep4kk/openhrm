"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Search, Users } from "lucide-react";

import type { OrgChartNode } from "@/lib/queries/employees";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The reporting tree.
 *
 * Drawn as a nested list with CSS connector lines rather than an absolutely
 * positioned canvas. Three reasons that is the better trade:
 *
 *  - it is a real `ul`/`li` hierarchy, so a screen reader announces depth and
 *    nesting for free, and Ctrl+F finds people;
 *  - it reflows on a phone instead of demanding pan-and-zoom on a wide canvas;
 *  - a 200-person org stays readable, because depth costs indentation rather
 *    than horizontal space that runs out.
 *
 * Branches below the second level start collapsed. Opening a company's chart to
 * 200 expanded rows tells you nothing; opening it to the top two layers with
 * a report count on each closed branch tells you the shape immediately.
 */

const AUTO_EXPAND_DEPTH = 2;

export function OrgChart({
  roots,
  unassigned,
  canOpenProfile,
}: {
  roots: OrgChartNode[];
  unassigned: OrgChartNode[];
  /** Directory-only viewers get names but no link to the full record. */
  canOpenProfile: boolean;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(collapsedBelow(roots, AUTO_EXPAND_DEPTH)),
  );

  const search = query.trim().toLowerCase();

  // Searching filters the tree to matching people and the managers above them,
  // so a result never appears without the line of command that leads to it.
  const visible = useMemo(
    () => (search ? roots.map((r) => filterTree(r, search)).filter(isNode) : roots),
    [roots, search],
  );

  const visibleUnassigned = useMemo(
    () => (search ? unassigned.filter((n) => matches(n, search)) : unassigned),
    [unassigned, search],
  );

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const found = visible.length > 0 || visibleUnassigned.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find someone"
            aria-label="Find someone in the chart"
            className="pl-9"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setCollapsed(new Set())}
          disabled={collapsed.size === 0}
        >
          Expand all
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCollapsed(new Set(collapsedBelow(roots, 1)))}
        >
          Collapse
        </Button>
      </div>

      {!found ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Nobody matches “{query}”.
        </p>
      ) : (
        <>
          {visible.map((root) => (
            <ul key={root.id} className="space-y-1">
              <Branch
                node={root}
                depth={0}
                // A search result set is small and already filtered, so keeping
                // it collapsed would hide the answer the user just asked for.
                collapsed={search ? new Set<string>() : collapsed}
                onToggle={toggle}
                canOpenProfile={canOpenProfile}
              />
            </ul>
          ))}

          {visibleUnassigned.length > 0 && (
            <section className="border-t pt-5">
              <h2 className="text-muted-foreground mb-3 text-xs font-medium">
                Not in a reporting line ({visibleUnassigned.length})
              </h2>
              <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {visibleUnassigned.map((node) => (
                  <li key={node.id}>
                    <NodeCard node={node} canOpenProfile={canOpenProfile} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Branch({
  node,
  depth,
  collapsed,
  onToggle,
  canOpenProfile,
}: {
  node: OrgChartNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  canOpenProfile: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = hasChildren && !collapsed.has(node.id);

  return (
    <li>
      <div className="flex items-center gap-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.firstName} ${node.lastName}'s reports`}
            className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring flex size-5 shrink-0 items-center justify-center rounded transition-colors outline-none focus-visible:ring-3"
          >
            {isOpen ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}

        <NodeCard
          node={node}
          canOpenProfile={canOpenProfile}
          emphasis={depth === 0}
        />
      </div>

      {isOpen && (
        // The left border is the connector line; the padding aligns it under
        // the parent's chevron so the tree reads as one continuous spine.
        <ul className="mt-1 space-y-1 border-l pl-4 md:ml-2.5">
          {node.children.map((child) => (
            <Branch
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              canOpenProfile={canOpenProfile}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function NodeCard({
  node,
  canOpenProfile,
  emphasis,
}: {
  node: OrgChartNode;
  canOpenProfile: boolean;
  emphasis?: boolean;
}) {
  const secondary = [node.designation, node.department].filter(Boolean).join(" · ");

  const body = (
    <>
      <PersonAvatar
        firstName={node.firstName}
        lastName={node.lastName}
        avatarUrl={node.avatarUrl}
        size="sm"
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {node.firstName} {node.lastName}
        </span>
        {secondary && (
          <span className="text-muted-foreground block truncate text-xs">
            {secondary}
          </span>
        )}
      </span>

      {node.totalReports > 0 && (
        <span
          className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-xs tabular-nums"
          title={`${node.totalReports} people in this reporting line`}
        >
          <Users className="size-3.5" aria-hidden />
          {node.totalReports}
        </span>
      )}
    </>
  );

  const className = cn(
    "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-2.5 py-1.5 transition-colors",
    emphasis ? "bg-muted/50" : "bg-card",
    canOpenProfile && "hover:border-foreground/20 hover:bg-muted/60",
  );

  if (!canOpenProfile) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Link
      href={`/people/${node.id}`}
      className={cn(className, "focus-visible:ring-ring outline-none focus-visible:ring-3")}
    >
      {body}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

/** Ids of every node deeper than `depth`, so they start collapsed. */
function collapsedBelow(nodes: OrgChartNode[], depth: number): string[] {
  const output: string[] = [];

  function walk(node: OrgChartNode, level: number) {
    if (level >= depth && node.children.length > 0) output.push(node.id);
    for (const child of node.children) walk(child, level + 1);
  }

  for (const node of nodes) walk(node, 0);
  return output;
}

function matches(node: OrgChartNode, search: string): boolean {
  return [
    `${node.firstName} ${node.lastName}`,
    node.employeeCode,
    node.designation ?? "",
    node.department ?? "",
    node.location ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(search);
}

/**
 * Keeps a node when it matches, or when anyone beneath it does. Returns a copy
 * so the unfiltered tree stays intact for when the search box is cleared.
 */
function filterTree(node: OrgChartNode, search: string): OrgChartNode | null {
  const children = node.children
    .map((child) => filterTree(child, search))
    .filter(isNode);

  if (children.length === 0 && !matches(node, search)) return null;
  return { ...node, children };
}

function isNode(node: OrgChartNode | null): node is OrgChartNode {
  return node !== null;
}
