"use client";

import { useActionState, useEffect, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { updateLetterheadAction } from "@/lib/actions/settings";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The letterhead: logo, registered address, default signatory.
 *
 * The logo is stored as a `data:` URI on the organisation row, so this is the
 * one form in the app that posts a file. It is deliberately not a general file
 * upload — there is no bucket, no object store and no new dependency, because a
 * logo is a few kilobytes that has to appear inside emails, where a link to
 * private storage would render as a broken image.
 */
export function LetterheadForm({
  values,
}: {
  values: {
    logoUrl: string | null;
    letterheadAddress: string;
    signatoryName: string;
    signatoryTitle: string;
  };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateLetterheadAction,
    {},
  );

  // Shows the chosen file before it is uploaded, so a wrong pick is caught
  // before it lands on every letter the company issues.
  const [preview, setPreview] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  // Bumping this remounts the file input, which is the only way to clear a
  // chosen file without reaching into the DOM.
  const [inputKey, setInputKey] = useState(0);

  // Once the save lands, the server sends back the stored logo and the local
  // preview is stale. Resetting during render — rather than in an effect —
  // is React's own answer to "adjust state when a prop changes", and avoids
  // the extra render pass an effect would cost.
  const [lastSaved, setLastSaved] = useState(values.logoUrl);
  if (lastSaved !== values.logoUrl) {
    setLastSaved(values.logoUrl);
    setPreview(null);
    setRemoving(false);
    setInputKey((k) => k + 1);
  }

  useEffect(() => {
    if (state.success) toast.success("Letterhead updated");
  }, [state.success]);

  useEffect(() => {
    // Object URLs pin the file in memory until they are released. This runs
    // when `preview` changes and on unmount, so each URL is revoked exactly
    // once, after nothing is pointing at it any more.
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const current = removing ? null : (preview ?? values.logoUrl);

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />
      {removing && <input type="hidden" name="removeLogo" value="1" />}

      <div className="space-y-2">
        <Label htmlFor="logo">Logo</Label>

        <div className="flex flex-wrap items-center gap-4">
          <div className="border-border bg-muted/40 flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
            {current ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current}
                alt="Current logo"
                className="max-h-16 max-w-36 object-contain"
              />
            ) : (
              <span className="text-muted-foreground text-xs">No logo</span>
            )}
          </div>

          <div className="space-y-2">
            <Input
              key={inputKey}
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              aria-invalid={Boolean(state.fieldErrors?.logo)}
              aria-describedby={state.fieldErrors?.logo ? "logo-error" : "logo-hint"}
              className="max-w-xs"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setPreview(URL.createObjectURL(file));
                setRemoving(false);
              }}
            />

            {values.logoUrl && !removing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRemoving(true);
                  setPreview(null);
                  setInputKey((k) => k + 1);
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Remove logo
              </Button>
            )}

            {removing && (
              <p className="text-muted-foreground text-xs">
                The logo will be removed when you save.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => setRemoving(false)}
                >
                  Keep it
                </button>
              </p>
            )}
          </div>
        </div>

        {state.fieldErrors?.logo ? (
          <p id="logo-error" role="alert" className="text-destructive text-xs">
            {state.fieldErrors.logo}
          </p>
        ) : (
          <p id="logo-hint" className="text-muted-foreground text-xs">
            PNG, JPEG, WebP or SVG, up to 256KB. Appears in the sidebar, on every
            generated letter and in the emails that carry them.
          </p>
        )}
      </div>

      <FormField
        label="Registered address"
        name="letterheadAddress"
        error={state.fieldErrors?.letterheadAddress}
        hint="Printed at the top right of every letter. Available to templates as {{org.address}}."
      >
        {(p) => (
          <Textarea
            {...p}
            defaultValue={values.letterheadAddress}
            rows={4}
            placeholder={"4th Floor, Prestige Tower\nMG Road, Bengaluru 560001\nKarnataka, India"}
          />
        )}
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Signatory name"
          name="signatoryName"
          error={state.fieldErrors?.signatoryName}
          hint="Who letters are signed by, unless a template says otherwise."
        >
          {(p) => <Input {...p} defaultValue={values.signatoryName} placeholder="Ananya Rao" />}
        </FormField>

        <FormField
          label="Signatory title"
          name="signatoryTitle"
          error={state.fieldErrors?.signatoryTitle}
        >
          {(p) => (
            <Input
              {...p}
              defaultValue={values.signatoryTitle}
              placeholder="Head of People"
            />
          )}
        </FormField>
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-5">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ImageUp className="size-3.5" aria-hidden />
          Stored in the database, so it travels with your backups.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save letterhead"}
        </Button>
      </div>
    </form>
  );
}
