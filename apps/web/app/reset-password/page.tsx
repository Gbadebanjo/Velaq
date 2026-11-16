import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "../_auth/AuthLayout";
import { ResetPasswordForm } from "../_auth/forms";

export const metadata: Metadata = { title: "Choose a new password · Velaq" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  if (!email) redirect("/forgot-password");
  return (
    <AuthLayout
      icon="key"
      title="Choose a new password"
      intro={<p>If <strong>{email}</strong> has an account, we've sent it a code. Setting a new password signs you out on your other devices.</p>}
      footer={<p><Link href="/sign-in">Back to sign in</Link></p>}
    >
      <ResetPasswordForm email={email} />
    </AuthLayout>
  );
}
