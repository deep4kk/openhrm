"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

/**
 * The filter row, generalised.
 *
 * People arrived first and grew its own version (src/components/people/
 * people-filters.tsx); every module after it wants the same behaviour, so this
 * is that behaviour with the specifics lifted into props rather than eight
 * near-identical files.
 *
 * The rules it encodes, which are the reason it exists at all:
 *  - Filters live in the URL. A filtered view is then shareable, survives a
 *    refresh, and comes back intact on the browser's back button.
 *  - "all" and "" are the same thing as absent, so the URL stays short and a
 *    cleared filter leaves no trace.
 *  - Search is debounced; every other control applies immediately, because a
 *    select has no "still typing" state to wait out.
 */

export interface FilterSelect {
  /** Query-string key. */
  key: string;
  label: string;
  /** First entry is the default and is written as "all". */
  options: { value: string; label: string }[];
  width?: string;
}

export function FilterBar({
  searchKey = "q",
  searchPlaceholder,
  searchLabel = "Search",
  selects = [],
  count,
  countNoun = ["result", "results"],
}: {
  searchKey?: string | null;
  searchPlaceholder?: string;
  searchLabel?: string;
  selects?: FilterSelect[];
  count?: number;
  countNoun?: [string, string];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState(
    searchKey ? (params.get(searchKey) ?? "") : "",
  );

  useEffect(() => {
    if (searchKey) setSearch(params.get(searchKey) ?? "");
  }, [params, searchKey]);

  function apply(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "" || value === "all") query.delete(key);
      else query.set(key, value);
    }
    query.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    });
  }

  useEffect(() => {
    if (!searchKey) return;
    const current = params.get(searchKey) ?? "";
    if (search === current) return;

    const timer = setTimeout(() => apply({ [searchKey]: search || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const active =
    selects.filter((s) => params.get(s.key)).length + (search ? 1 : 0);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {searchKey && (
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            className="pl-8"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {selects.map((select) => {
          // Base UI reads the trigger's label out of this map; without it the
          // trigger renders the raw value instead of its label.
          const items = Object.fromEntries(
            select.options.map((o) => [o.value, o.label]),
          );
          return (
            <Select
              key={select.key}
              items={items}
              value={params.get(select.key) ?? select.options[0]?.value ?? "all"}
              onValueChange={(v) => apply({ [select.key]: String(v) })}
            >
              <SelectTrigger
                className={select.width ?? "w-[10.5rem]"}
                aria-label={select.label}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {select.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}

        {active > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              apply(
                Object.fromEntries([
                  ...(searchKey ? [[searchKey, null]] : []),
                  ...selects.map((s) => [s.key, null]),
                ]),
              );
            }}
          >
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
        )}
      </div>

      {count !== undefined && (
        <p
          className="text-muted-foreground ml-auto text-sm tabular-nums"
          aria-live="polite"
        >
          {pending
            ? "Filtering…"
            : `${count} ${count === 1 ? countNoun[0] : countNoun[1]}`}
        </p>
      )}
    </div>
  );
}
