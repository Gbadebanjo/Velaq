"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type FormState, forgotPassword, resendCode, resetPassword, signIn, signUp, verifyEmail } from "./actions";
import { CodeField, Field, FormMessage, LinkButton, PasswordField, Submit } from "./fields";

const empty: FormState = {};

export function SignUpForm() {
  const [state, action] = useActionState(signUp, empty);
  return (
    <form action={action} noValidate>
      <FormMessage message={state.message} />
      <div className="field-pair">
        <Field label="First name" name="firstName" autoComplete="given-name" required maxLength={80} defaultValue={state.values?.firstName} error={state.fields?.firstName} />
        <Field label="Last name" name="lastName" autoComplete="family-name" required maxLength={80} defaultValue={state.values?.lastName} error={state.fields?.lastName} />
      </div>
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fields?.email} />
      <PasswordField label="Password" name="password" autoComplete="new-password" hint="At least 12 characters. A short phrase is easiest to remember." error={state.fields?.password} />
      <Submit pending="Creating your account…">Create account</Submit>
    </form>
  );
}

export function SignInForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action] = useActionState(signIn, empty);
  return (
    <form action={action} noValidate>
      <FormMessage message={state.message} notice={state.message ? undefined : notice} />
      <input type="hidden" name="next" value={next} />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fields?.email} />
      <PasswordField label="Password" name="password" autoComplete="current-password" error={state.fields?.password} />
      <p className="form-aside"><Link href="/forgot-password">Forgot your password?</Link></p>
      <Submit pending="Signing in…">Sign in</Submit>
    </form>
  );
}

function ResendForm({ email, purpose }: { email: string; purpose: "verify_email" | "reset_password" }) {
  const [state, action] = useActionState(resendCode, empty);
  return (
    <form action={action} className="resend">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="purpose" value={purpose} />
      <FormMessage message={state.message} notice={state.notice} />
      <p>Didn't get it? Check spam, or <LinkButton pending="Sending…">send a new code</LinkButton>.</p>
    </form>
  );
}

export function VerifyEmailForm({ email, next }: { email: string; next: string }) {
  const [state, action] = useActionState(verifyEmail, empty);
  return (
    <>
      <form action={action} noValidate>
        <FormMessage message={state.message} />
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <CodeField error={state.fields?.code} />
        <Submit pending="Checking…">Confirm email</Submit>
      </form>
      <ResendForm email={email} purpose="verify_email" />
    </>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPassword, empty);
  return (
    <form action={action} noValidate>
      <FormMessage message={state.message} />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fields?.email} />
      <Submit pending="Sending code…">Send reset code</Submit>
    </form>
  );
}

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, action] = useActionState(resetPassword, empty);
  return (
    <>
      <form action={action} noValidate>
        <FormMessage message={state.message} />
        <input type="hidden" name="email" value={email} />
        <CodeField error={state.fields?.code} />
        <PasswordField label="New password" name="password" autoComplete="new-password" hint="At least 12 characters." error={state.fields?.password} />
        <Submit pending="Saving…">Set new password</Submit>
      </form>
      <ResendForm email={email} purpose="reset_password" />
    </>
  );
}
