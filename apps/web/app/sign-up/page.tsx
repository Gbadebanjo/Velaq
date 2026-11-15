import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "../_auth/AuthLayout";
import { SignUpForm } from "../_auth/forms";

export const metadata: Metadata = { title: "Create your account · Velaq" };

export default function SignUpPage() {
  return (
    <AuthLayout
      title="Create your Velaq account"
      intro={<p>Start with Velaq Personal. It's free.</p>}
      footer={<p>Already have an account? <Link href="/sign-in">Sign in</Link></p>}
    >
      <SignUpForm />
    </AuthLayout>
  );
}
