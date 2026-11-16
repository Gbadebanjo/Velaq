"use client";

import { useEffect, useId, useRef, useState } from "react";
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

const LENGTH = 6;

/**
 * The emailed code as six boxes. Typing moves forward, Backspace and the arrow keys move back,
 * and pasting (or the phone's "from Mail" suggestion) fills every box at once. The six digits
 * are sent as one hidden "code" field, so the server sees exactly what it did before.
 * With autoSubmit, the form sends itself as soon as the sixth digit is in.
 */
export function CodeField({ error, failed = false, attempt, autoSubmit = false }: { error?: string; failed?: boolean; attempt?: unknown; autoSubmit?: boolean }) {
  const id = useId();
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(""));
  const [shake, setShake] = useState(false);
  // Red only until the person starts typing the next attempt.
  const [retyping, setRetyping] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const hidden = useRef<HTMLInputElement>(null);
  const code = digits.join("");

  // A wrong code: clear the boxes, shake them once, and start again from the first.
  const wrong = !!error || failed;
  useEffect(() => {
    if (!wrong) return;
    setDigits(Array(LENGTH).fill(""));
    setRetyping(false);
    setShake(true);
    boxes.current[0]?.focus();
    const t = setTimeout(() => setShake(false), 450);
    return () => clearTimeout(t);
  }, [wrong, attempt]);

  const fill = (from: number, text: string) => {
    const incoming = text.replace(/\D/g, "").slice(0, LENGTH - from).split("");
    if (!incoming.length) return;
    setRetyping(true);
    const next = [...digits];
    incoming.forEach((d, i) => (next[from + i] = d));
    setDigits(next);
    const done = next.every(Boolean);
    boxes.current[done ? LENGTH - 1 : Math.min(from + incoming.length, LENGTH - 1)]?.focus();
    if (done && autoSubmit) {
      // Let React write the hidden field first, then send.
      requestAnimationFrame(() => hidden.current?.form?.requestSubmit());
    } else if (done) {
      // On to the next thing to fill in (the new password, on the reset screen).
      const els = [...(hidden.current?.form?.elements ?? [])] as HTMLElement[];
      const after = els.slice(els.indexOf(hidden.current as HTMLElement) + 1).find((el) => el instanceof HTMLInputElement && el.type !== "hidden");
      requestAnimationFrame(() => after?.focus());
    }
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) next[i] = "";
      else if (i > 0) {
        next[i - 1] = "";
        boxes.current[i - 1]?.focus();
      }
      setDigits(next);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      boxes.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < LENGTH - 1) {
      e.preventDefault();
      boxes.current[i + 1]?.focus();
    }
  };

  return (
    <div className="field">
      <p id={`${id}-label`} className="otp-label">Enter the 6-digit code</p>
      <div className={`otp${shake ? " otp-shake" : ""}${wrong && !retyping ? " otp-error" : ""}`} role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            className={`otp-box${d ? " filled" : ""}`}
            value={d}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={i === 0}
            maxLength={LENGTH}
            aria-label={`Digit ${i + 1} of ${LENGTH}`}
            aria-invalid={wrong && !retyping ? true : undefined}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              if (!raw) return setDigits((ds) => ds.map((x, j) => (j === i ? "" : x)));
              if (raw.length >= LENGTH) return fill(0, raw); // the whole code, autofilled or pasted
              if (d && raw.length === 2) return fill(i, raw.replace(d, "").slice(-1) || raw.slice(-1)); // typed over a digit
              fill(i, raw);
            }}
            onPaste={(e) => {
              e.preventDefault();
              fill(0, e.clipboardData.getData("text"));
            }}
            onKeyDown={(e) => onKey(i, e)}
            onFocus={(e) => e.currentTarget.select()}
          />
        ))}
        {/* Not empty-required: the browser would block a half-typed code without our message. */}
        <input ref={hidden} type="hidden" name="code" value={code} />
      </div>
      {error ? <p id={`${id}-error`} className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}

/** "Send a new code", which waits 30 seconds between sends so a slow email isn't answered with a pile of codes. */
export function ResendButton({ sentAt }: { sentAt: number }) {
  const { pending } = useFormStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const wait = Math.min(30, Math.max(0, 30 - Math.floor((now - sentAt) / 1000)));
  return (
    <button type="submit" className="btn ghost resend-btn" disabled={pending || wait > 0}>
      {pending ? "Sending…" : wait > 0 ? `Resend in ${wait}s` : "Resend code"}
    </button>
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
