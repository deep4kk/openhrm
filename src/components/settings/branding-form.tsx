"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
  saveBrandingAction,
  saveIntegrationsAction,
  testChatIntegrationAction,
} from "@/lib/actions/platform";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * White-labelling (PRD §8.29).
 *
 * The brand colour is an OKLCH triple rather than a hex code, because that is
 * what the token set is written in and converting hex to OKLCH in the browser
 * would mean shipping a colour library to change one variable. A live swatch
 * makes the format learnable in one attempt, which is the actual usability
 * concern.
 */
export function BrandingForm({
  branding,
}: {
  branding: {
    brandColor: string;
    loginTagline: string;
    supportEmail: string;
    customDomain: string;
  };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveBrandingAction,
    {},
  );
  const [color, setColor] = useState(branding.brandColor);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Branding saved");
      router.refresh();
    }
  }, [state.success, router]);

  const valid = /^[\d.]+\s+[\d.]+\s+[\d.]+$/.test(color.trim());

  return (
    <form action={action} className="surface space-y-5 p-5">
      <FormError message={state.error} />

      <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
        <FormField
          label="Brand colour"
          name="brandColor"
          error={state.fieldErrors?.brandColor}
          hint="OKLCH: lightness chroma hue, e.g. 0.55 0.18 265. Used on buttons, links and the careers page."
        >
          {(p) => (
            <Input
              {...p}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="0.546 0.245 262.881"
              className="font-mono text-xs"
            />
          )}
        </FormField>

        <div className="flex flex-col justify-end pb-1">
          <span className="text-muted-foreground mb-1.5 text-xs">Preview</span>
          <span
            className="border-input size-9 rounded-md border"
            style={
              valid
                ? { backgroundColor: `oklch(${color.trim()})` }
                : { backgroundColor: "var(--muted)" }
            }
            aria-hidden
          />
        </div>
      </div>

      <FormField
        label="Login tagline"
        name="loginTagline"
        hint="One line under your name on the sign-in and careers pages."
      >
        {(p) => (
          <Input {...p} defaultValue={branding.loginTagline} maxLength={160} />
        )}
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Support email"
          name="supportEmail"
          error={state.fieldErrors?.supportEmail}
          hint="Where employees are told to write when something is wrong."
        >
          {(p) => (
            <Input {...p} type="email" defaultValue={branding.supportEmail} />
          )}
        </FormField>

        <FormField
          label="Custom domain"
          name="customDomain"
          hint="Self-hosted only. Point it at this instance with your reverse proxy first."
        >
          {(p) => (
            <Input
              {...p}
              defaultValue={branding.customDomain}
              placeholder="hr.yourcompany.com"
              className="font-mono text-xs"
            />
          )}
        </FormField>
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save branding
        </Button>
      </div>
    </form>
  );
}

/**
 * Chat notifications (PRD §8.24).
 *
 * Slack and Teams both accept a plain JSON body on an incoming-webhook URL, so
 * one form covers both. The test button exists because an incoming-webhook URL
 * that is subtly wrong fails silently forever otherwise.
 */
export function IntegrationsForm({
  integrations,
}: {
  integrations: { slackWebhookUrl: string; teamsWebhookUrl: string };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveIntegrationsAction,
    {},
  );
  const [testing, startTest] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Integrations saved");
      router.refresh();
    }
  }, [state.success, router]);

  const connected =
    integrations.slackWebhookUrl || integrations.teamsWebhookUrl;

  return (
    <form action={action} className="surface space-y-5 p-5">
      <FormError message={state.error} />

      <FormField
        label="Slack incoming webhook"
        name="slackWebhookUrl"
        error={state.fieldErrors?.slackWebhookUrl}
        hint="Slack → Apps → Incoming Webhooks → Add to Workspace, then paste the URL."
      >
        {(p) => (
          <Input
            {...p}
            type="url"
            defaultValue={integrations.slackWebhookUrl}
            placeholder="https://hooks.slack.com/services/…"
            className="font-mono text-xs"
          />
        )}
      </FormField>

      <FormField
        label="Microsoft Teams incoming webhook"
        name="teamsWebhookUrl"
        error={state.fieldErrors?.teamsWebhookUrl}
        hint="Teams channel → Connectors → Incoming Webhook."
      >
        {(p) => (
          <Input
            {...p}
            type="url"
            defaultValue={integrations.teamsWebhookUrl}
            placeholder="https://outlook.office.com/webhook/…"
            className="font-mono text-xs"
          />
        )}
      </FormField>

      <p className="text-muted-foreground text-xs">
        New helpdesk tickets and company announcements are posted to whichever of
        these is set. Nothing containing salary or personal data is ever sent to
        a chat channel.
      </p>

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        {connected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testing}
            onClick={() =>
              startTest(async () => {
                const result = await testChatIntegrationAction();
                if (result.error) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Test message sent");
              })
            }
          >
            {testing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            Send a test message
          </Button>
        ) : (
          <span />
        )}

        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save
        </Button>
      </div>
    </form>
  );
}
