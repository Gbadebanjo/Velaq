import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "../_auth/AuthLayout";
import { ForgotPasswordForm } from "../_auth/forms";

export const metadata: Metadata = { title: "Reset your password · Velaq" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      intro={<p>Enter the email you signed up with. If there's an account, we'll send a code to reset the password.</p>}
      footer={<p>Remembered it? <Link href="/sign-in">Sign in</Link></p>}
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
