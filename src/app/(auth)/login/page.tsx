import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  // Already signed in? Don't make them log in twice.
  if (await getSession()) redirect("/dashboard");
  return <LoginForm />;
}
