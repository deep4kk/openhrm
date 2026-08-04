import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create your organisation",
};

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  return <SignupForm />;
}
