import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "../_auth/AuthLayout";
import { VerifyEmailForm } from "../_auth/forms";

export const metadata: Metadata = { title: "Confirm your email · Velaq" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string; next?: string }> }) {
  const { email, next } = await searchParams;
  if (!email) redirect("/sign-up");
  return (
    <AuthLayout
      icon="mail"
      title="Check your email"
      intro={<p>We sent a code to <strong>{email}</strong>. It expires in 10 minutes.</p>}
      footer={<p>Wrong email address? <Link href="/sign-up">Start again</Link></p>}
    >
      <VerifyEmailForm email={email} next={next ?? "/app"} />
    </AuthLayout>
  );
}
