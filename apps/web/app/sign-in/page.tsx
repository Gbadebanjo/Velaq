import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "../_auth/AuthLayout";
import { SignInForm } from "../_auth/forms";

export const metadata: Metadata = { title: "Sign in · Velaq" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; signed_out?: string }> }) {
  const { next, signed_out } = await searchParams;
  return (
    <AuthLayout
      title="Sign in to Velaq"
      footer={<p>New to Velaq? <Link href="/sign-up">Create an account</Link></p>}
    >
      <SignInForm next={next ?? "/app"} notice={signed_out ? "You've signed out." : undefined} />
    </AuthLayout>
  );
}
