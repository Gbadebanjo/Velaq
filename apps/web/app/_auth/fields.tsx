"use client";

import { useId, useState } from "react";
import { useFormStatus } from "react-dom";

export function FormMessage({ message, notice }: { message?: string; notice?: string }) {
  if (message) return <p className="form-error" role="alert">{message}</p>;
  if (notice) return <p className="form-notice" role="status">{notice}</p>;
  return null;
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

export function Field({ label, name, error, hint, ...input }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? <p id={`${id}-hint`} className="field-hint">{hint}</p> : null}
      <input id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {error ? <p id={`${id}-error`} className="field-error">{error}</p> : null}
    </div>
  );
}

export function PasswordField({ label, name, error, hint, autoComplete }: {
  label: string; name: string; error?: string; hint?: string; autoComplete: "current-password" | "new-password";
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? <p id={`${id}-hint`} className="field-hint">{hint}</p> : null}
      <div className="password-wrap">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required
          maxLength={128}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <button type="button" className="password-toggle" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {error ? <p id={`${id}-error`} className="field-error">{error}</p> : null}
    </div>
  );
}

export function CodeField({ error }: { error?: string }) {
  return (
    <Field
      label="Code"
      name="code"
      hint="6 digits"
      error={error}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      required
      className="code-input"
    />
  );
}

export function Submit({ children, pending }: { children: React.ReactNode; pending: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" className="btn primary lg block" disabled={busy} aria-disabled={busy}>
      {busy ? pending : children}
    </button>
  );
}

export function LinkButton({ children, pending }: { children: React.ReactNode; pending: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" className="link-button" disabled={busy}>
      {busy ? pending : children}
    </button>
  );
}
