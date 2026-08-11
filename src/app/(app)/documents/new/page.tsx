import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, FileStack } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { letterKindLabel } from "@/lib/documents/types";
import { formVariables, reconcile } from "@/lib/documents/variables";
import {
  getLetterhead,
  getTemplate,
  listAddressableEmployees,
  listUsableTemplates,
} from "@/lib/queries/documents";
import { EmptyState, PageHeader, PageShell } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { GenerateForm } from "@/components/documents/generate-form";

export const metadata: Metadata = { title: "New document" };

/**
 * One route, two steps: pick a template, then fill it in. A separate
 * `/documents/new/[templateId]` route would be tidier in the file tree and
 * worse to use — going back to change your mind about the template should not
 * lose what you have already typed into the URL bar.
 */
export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const session = await requirePermission("letter.manage");
  const { template: templateId } = await searchParams;

  if (!templateId) {
    return <TemplatePicker session={session} />;
  }

  const template = await getTemplate(session, templateId);
  if (!template || !template.isActive) {
    return <TemplatePicker session={session} missing />;
  }

  const [employees, letterhead] = await Promise.all([
    listAddressableEmployees(session),
    getLetterhead(session),
  ]);

  // Only the variables a person fills in. {{org.name}} and friends are resolved
  // from the organisation at generation time and never shown as fields.
  const variables = formVariables(
    reconcile(template.body, template.subject, template.variables),
  );

  // The same system tokens the action resolves, so the preview reads like the
  // finished letter. The reference number is the one exception — it is only
  // reserved at generation, so the preview shows its shape rather than a number
  // that would turn out to be wrong.
  const systemValues: Record<string, string> = {
    "org.name": letterhead?.orgName ?? session.org.name,
    "org.address": letterhead?.address ?? "",
    "org.website": letterhead?.website ?? "",
    "org.email": letterhead?.email ?? "",
    "org.signatoryName": letterhead?.signatoryName ?? "",
    "org.signatoryTitle": letterhead?.signatoryTitle ?? "",
    "letter.date": formatDate(new Date()),
    "letter.number": "(assigned on generate)",
  };

  return (
    <PageShell className="max-w-4xl">
      <Link
        href="/documents/new"
        className="text-muted-foreground hover:text-foreground -mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Change template
      </Link>

      <PageHeader
        title={template.name}
        description={template.description ?? letterKindLabel(template.kind)}
      />

      <GenerateForm
        templateId={template.id}
        templateSubject={template.subject}
        templateBody={template.body}
        variables={variables}
        systemValues={systemValues}
        currency={session.org.currency}
        employees={employees.map((employee) => ({
          id: employee.id,
          employeeCode: employee.employeeCode,
          name:
            employee.displayName?.trim() ||
            `${employee.firstName} ${employee.lastName}`.trim(),
          workEmail: employee.workEmail,
          designation: employee.designation?.title ?? null,
          status: employee.status,
        }))}
      />
    </PageShell>
  );
}

async function TemplatePicker({
  session,
  missing,
}: {
  session: Awaited<ReturnType<typeof requirePermission>>;
  missing?: boolean;
}) {
  const templates = await listUsableTemplates(session);

  return (
    <PageShell className="max-w-4xl">
      <Link
        href="/documents"
        className="text-muted-foreground hover:text-foreground -mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Documents
      </Link>

      <PageHeader
        title="New document"
        description={
          missing
            ? "That template is no longer available. Pick another one."
            : "Pick the kind of letter you need."
        }
      />

      {templates.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={FileStack}
            title="No active templates"
            description="Create a template first — describe the letter you want and let AI draft it, or write it yourself."
            action={
              <LinkButton href="/documents/templates/new">Create a template</LinkButton>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/documents/new?template=${template.id}`}
              className="surface hover:border-ring/40 flex flex-col p-4 transition-colors"
            >
              <h2 className="text-sm font-semibold">{template.name}</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {letterKindLabel(template.kind)}
              </p>
              {template.description && (
                <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">
                  {template.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
