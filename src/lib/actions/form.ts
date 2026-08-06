import type { z } from "zod";

/**
 * Collapses a Zod error into the `fieldErrors` shape every form in the app
 * reads. First message per field wins — showing three complaints about one
 * input is noise, and the first one is the one the user has to fix anyway.
 */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const output: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !output[key]) output[key] = issue.message;
  }
  return output;
}
