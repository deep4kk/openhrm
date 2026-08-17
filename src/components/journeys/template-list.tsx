"use client";

import { useState } from "react";
import { ChevronDown, ClipboardList, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/page-header";
import { TemplateEditor, type TemplateDraft } from "./template-editor";
import { cn } from "@/lib/utils";

/**
 * The template list, with editing inline.
 *
 * Expanding a row into its editor rather than routing to a separate page: a
 * checklist is a list of short strings, the whole thing fits on screen, and
 * keeping the other templates visible while editing one is how you notice you
 * are about to duplicate a task that already exists next door.
 */
export function TemplateList({ templates }: { templates: TemplateDraft[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant={creating ? "ghost" : "default"}
          onClick={() => {
            setCreating((c) => !c);
            setOpenId(null);
          }}
        >
          <Plus className="size-4" aria-hidden />
          {creating ? "Cancel" : "New checklist"}
        </Button>
      </div>

      {creating && (
        <div className="surface p-5">
          <h2 className="mb-4 text-sm font-semibold">New checklist</h2>
          <TemplateEditor
            template={{
              name: "",
              kind: "ONBOARDING",
              description: "",
              items: [],
              usageCount: 0,
            }}
            onDone={() => setCreating(false)}
          />
        </div>
      )}

      {templates.length === 0 && !creating ? (
        <div className="surface">
          <EmptyState
            icon={ClipboardList}
            title="No checklists yet"
            description="A checklist is the list of things that have to happen around someone joining or leaving — with an owner and a date for each."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {templates.map((template) => {
            const open = openId === template.id;
            return (
              <li key={template.id} className="surface overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(open ? null : (template.id ?? null));
                    setCreating(false);
                  }}
                  aria-expanded={open}
                  className="hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center gap-3 p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{template.name}</span>
                      <StatusBadge
                        label={
                          template.kind === "ONBOARDING"
                            ? "Onboarding"
                            : "Offboarding"
                        }
                        tone={template.kind === "ONBOARDING" ? "info" : "neutral"}
                      />
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {template.items.length} task
                      {template.items.length === 1 ? "" : "s"}
                      {template.usageCount > 0 &&
                        ` · used ${template.usageCount} time${
                          template.usageCount === 1 ? "" : "s"
                        }`}
                      {template.description && ` · ${template.description}`}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "text-muted-foreground size-4 shrink-0 transition-transform",
                      open && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>

                {open && (
                  <div className="border-t p-5">
                    <TemplateEditor
                      template={template}
                      onDone={() => setOpenId(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
