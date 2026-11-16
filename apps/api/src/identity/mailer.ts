export const MAILER = Symbol("MAILER");

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

/** Development: print the email in the API terminal instead of sending it. */
export class ConsoleMailer implements Mailer {
  async send(email: Email): Promise<void> {
    const line = "-".repeat(60);
    console.log(`\n${line}\nEmail to ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n${line}\n`);
  }
}

/** Production: send through Resend's HTTP API. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(email: Email): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Resend says why in its reply, e.g. "You can only send testing emails to your own email address".
      const reason = await res
        .json()
        .then((b: { name?: string; message?: string }) => [b.name, b.message].filter(Boolean).join(": "))
        .catch(() => "");
      throw new Error(`Resend refused the email (${res.status})${reason ? `: ${reason}` : ""}`);
    }
  }
}

export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.RESEND_API_KEY) return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM ?? "Velaq <no-reply@velaq.com>");
  if (env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is required in production to send sign-in emails");
  return new ConsoleMailer();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const hello = (firstName?: string | null) => (firstName ? `Hi ${firstName},` : "Hi,");

function codeEmail(to: string, firstName: string | null | undefined, subject: string, intro: string, code: string, outro: string): Email {
  return {
    to,
    subject,
    text: `${hello(firstName)}\n\n${intro}\n\n    ${code}\n\n${outro}\n\nIf you didn't ask for this, you can ignore this email.\n\nVelaq`,
    html: `<div style="font-family:Montserrat,Arial,sans-serif;color:#0A274B;max-width:480px">
<p>${esc(hello(firstName))}</p>
<p>${esc(intro)}</p>
<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:24px 0">${esc(code)}</p>
<p>${esc(outro)}</p>
<p style="color:#4a5d78;font-size:13px">If you didn't ask for this, you can ignore this email.</p>
<p style="font-weight:700">Velaq</p></div>`,
  };
}

export const emails = {
  verify: (to: string, code: string, firstName?: string | null) =>
    codeEmail(to, firstName, `${code} is your Velaq confirmation code`, "Use this code to confirm your email address:", code, "The code expires in 10 minutes."),
  reset: (to: string, code: string, firstName?: string | null) =>
    codeEmail(to, firstName, `${code} is your Velaq password reset code`, "Use this code to choose a new password:", code, "The code expires in 10 minutes. Resetting your password signs you out everywhere."),
  alreadyRegistered: (to: string, firstName?: string | null): Email => ({
    to,
    subject: "Someone tried to create a Velaq account with your email",
    text: `${hello(firstName)}\n\n` + "Someone tried to sign up for Velaq with this email address, but you already have an account.\n\nIf it was you, sign in instead, or reset your password if you've forgotten it.\n\nVelaq",
    html: `<div style="font-family:Montserrat,Arial,sans-serif;color:#0A274B;max-width:480px"><p>${esc(hello(firstName))}</p><p>Someone tried to sign up for Velaq with this email address, but you already have an account.</p><p>If it was you, sign in instead, or reset your password if you've forgotten it.</p><p style="font-weight:700">Velaq</p></div>`,
  }),
};
