"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { type FormState, forgotPassword, resendCode, resetPassword, signIn, signUp, verifyEmail } from "./actions";
import { CodeField, Field, FormMessage, PasswordField, ResendButton, Submit } from "./fields";

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

/** Shortcuts to the inbox for the big email providers, so nobody has to go looking for the code. */
const INBOXES: [RegExp, string, string][] = [
  [/@(gmail|googlemail)\.com$/i, "Open Gmail", "https://mail.google.com/mail/u/0/#inbox"],
  [/@(outlook|hotmail|live|msn)\.[a-z.]+$/i, "Open Outlook", "https://outlook.live.com/mail/0/"],
  [/@(yahoo|ymail)\.[a-z.]+$/i, "Open Yahoo Mail", "https://mail.yahoo.com/"],
  [/@(icloud|me|mac)\.com$/i, "Open iCloud Mail", "https://www.icloud.com/mail"],
];

function ResendForm({ email, purpose }: { email: string; purpose: "verify_email" | "reset_password" }) {
  const [state, action] = useActionState(resendCode, empty);
  // The first code was sent just before this page opened; each new one restarts the wait.
  const [sentAt, setSentAt] = useState(() => Date.now());
  useEffect(() => {
    if (state.notice) setSentAt(Date.now());
  }, [state]);
  const inbox = INBOXES.find(([re]) => re.test(email));
  return (
    <form action={action} className="resend">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="purpose" value={purpose} />
      <FormMessage message={state.message} notice={state.notice} />
      <div className="resend-row">
        {inbox ? (
          <a className="btn ghost" href={inbox[2]} target="_blank" rel="noopener noreferrer">
            {inbox[1]}
          </a>
        ) : null}
        <ResendButton sentAt={sentAt} />
      </div>
      <p className="resend-note">Can't find it? Check your spam or promotions folder.</p>
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
        <CodeField error={state.fields?.code} failed={!!state.message} attempt={state} autoSubmit />
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
        <CodeField error={state.fields?.code} failed={!!state.message} attempt={state} />
        <PasswordField label="New password" name="password" autoComplete="new-password" hint="At least 12 characters." error={state.fields?.password} />
        <Submit pending="Saving…">Set new password</Submit>
      </form>
      <ResendForm email={email} purpose="reset_password" />
    </>
  );
}
