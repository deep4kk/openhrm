"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Option {
  id: string;
  name: string;
}

/**
 * Filters live in the URL, not in component state.
 *
 * That makes a filtered view shareable ("here's everyone in Engineering on
 * notice"), survivable across a refresh, and restorable when the user hits
 * back — which the navigation rules ask for explicitly. The search box is
 * debounced so typing doesn't fire a request per keystroke.
 */
export function PeopleFilters({
  departments,
  locations,
  total,
}: {
  departments: Option[];
  locations: Option[];
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get("q") ?? "");

  // Keep the box in sync when the user navigates back to a filtered URL.
  useEffect(() => {
    setSearch(params.get("q") ?? "");
  }, [params]);

  function apply(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "" || value === "all") query.delete(key);
      else query.set(key, value);
    }
    // Any filter change returns to page one — page 4 of a new filter is a
    // classic way to land on an empty screen.
    query.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    });
  }

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (search === current) return;

    const timer = setTimeout(() => apply({ q: search || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const activeFilters = ["department", "location", "status"].filter((key) =>
    params.get(key),
  ).length;

  // Base UI resolves the trigger's label from this map. Without it the trigger
  // shows the raw value ("all") instead of "All departments".
  const departmentItems: Record<string, string> = {
    all: "All departments",
    ...Object.fromEntries(departments.map((d) => [d.id, d.name])),
  };
  const locationItems: Record<string, string> = {
    all: "All locations",
    ...Object.fromEntries(locations.map((l) => [l.id, l.name])),
  };
  const statusItems: Record<string, string> = {
    all: "Currently here",
    ACTIVE: "Active",
    ON_LEAVE: "On leave",
    NOTICE_PERIOD: "Notice period",
    EXITED: "Exited",
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative sm:max-w-xs sm:flex-1">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, code or email"
          aria-label="Search employees"
          className="pl-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={departmentItems}
          value={params.get("department") ?? "all"}
          onValueChange={(v) => apply({ department: String(v) })}
        >
          <SelectTrigger className="w-[10.5rem]" aria-label="Filter by department">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(departmentItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={locationItems}
          value={params.get("location") ?? "all"}
          onValueChange={(v) => apply({ location: String(v) })}
        >
          <SelectTrigger className="w-[9.5rem]" aria-label="Filter by location">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(locationItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={statusItems}
          value={params.get("status") ?? "all"}
          onValueChange={(v) => apply({ status: String(v) })}
        >
          <SelectTrigger className="w-[9.5rem]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(activeFilters > 0 || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              apply({ q: null, department: null, location: null, status: null });
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      <p
        className="text-muted-foreground ml-auto text-sm tabular-nums"
        aria-live="polite"
      >
        {pending ? "Filtering…" : `${total} ${total === 1 ? "person" : "people"}`}
      </p>
    </div>
  );
}
