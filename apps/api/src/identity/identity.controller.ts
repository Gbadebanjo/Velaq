import { BadRequestException, Body, Controller, HttpCode, HttpException, Inject, Patch, Post, Req, HttpStatus, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { bearerToken } from "../auth/auth.guard.js";
import { CurrentPrincipal, Public } from "../auth/decorators.js";
import type { Principal } from "../auth/principal.js";
import { IdentityError, IdentityService, LIMITS, type RequestMeta } from "./identity.service.js";

const email = z.string().trim().min(1, "Enter your email address.").max(254, "That email address is too long.").email("Enter a valid email address.");
const password = z
  .string()
  .min(LIMITS.passwordMin, `Use at least ${LIMITS.passwordMin} characters.`)
  .max(LIMITS.passwordMax, `Use at most ${LIMITS.passwordMax} characters.`);
// Names: trimmed, inner runs of spaces collapsed, no control characters.
const personName = (what: string) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, `Enter your ${what}.`)
        .max(80, `Use at most 80 characters for your ${what}.`)
        .refine((s) => !/[\p{Cc}<>]/u.test(s), `Your ${what} has characters we can't accept.`),
    );
const name = { firstName: personName("first name"), lastName: personName("last name") };
const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.");

const schemas = {
  signUp: z.object({ ...name, email, password }),
  name: z.object(name),
  signIn: z.object({ email, password: z.string().min(1, "Enter your password.").max(LIMITS.passwordMax) }),
  verify: z.object({ email, code }),
  resend: z.object({ email, purpose: z.enum(["verify_email", "reset_password"]) }),
  forgot: z.object({ email }),
  reset: z.object({ email, code, password }),
};

/** Validates a request body, answering 400 with a message per field when it doesn't fit. */
export function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fields[key] ??= issue.message;
  }
  throw new BadRequestException({ error: "invalid_input", message: "Check the highlighted fields.", fields });
}

interface Req {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Client address for rate limits. The website calls this API from its server, so it passes the
 * visitor's address in x-velaq-client-ip, which is trusted only alongside the shared WEB_API_KEY.
 */
export function requestMeta(req: Req, webKey = process.env.WEB_API_KEY): RequestMeta {
  const header = (name: string) => {
    const v = req.headers[name];
    return typeof v === "string" ? v : null;
  };
  const forwarded = webKey && header("x-velaq-web-key") === webKey ? header("x-velaq-client-ip") : null;
  return { ip: forwarded ?? req.ip ?? null, userAgent: header("user-agent") };
}

function toHttp(e: unknown): never {
  if (e instanceof IdentityError) {
    const body = { error: e.code, message: e.message };
    if (e.code === "rate_limited") throw new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
    if (e.code === "invalid_credentials") throw new UnauthorizedException(body);
    if (e.code === "email_failed") throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    throw new BadRequestException(body);
  }
  if (e instanceof HttpException) throw e;
  throw e;
}

@Controller("v1/auth")
export class IdentityController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Public()
  @Post("sign-up")
  @HttpCode(202)
  async signUp(@Body() body: unknown, @Req() req: Req) {
    const b = parse(schemas.signUp, body);
    await this.identity.signUp(b.email, b.password, { firstName: b.firstName, lastName: b.lastName }, requestMeta(req)).catch(toHttp);
    return { next: "verify_email" };
  }

  @Public()
  @Post("verify-email")
  @HttpCode(200)
  async verifyEmail(@Body() body: unknown, @Req() req: Req) {
    const b = parse(schemas.verify, body);
    return { session: await this.identity.verifyEmail(b.email, b.code, requestMeta(req)).catch(toHttp) };
  }

  @Public()
  @Post("sign-in")
  @HttpCode(200)
  async signIn(@Body() body: unknown, @Req() req: Req) {
    const b = parse(schemas.signIn, body);
    return this.identity.signIn(b.email, b.password, requestMeta(req)).catch(toHttp);
  }

  @Public()
  @Post("resend-code")
  @HttpCode(202)
  async resendCode(@Body() body: unknown, @Req() req: Req) {
    const b = parse(schemas.resend, body);
    await this.identity.resendCode(b.email, b.purpose, requestMeta(req)).catch(toHttp);
    return { sent: true };
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(202)
  async forgotPassword(@Body() body: unknown, @Req() req: Req) {
    const b = parse(schemas.forgot, body);
    await this.identity.forgotPassword(b.email, requestMeta(req)).catch(toHttp);
    return { next: "reset_password" };
  }

  @Public()
  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() body: unknown, @Req() req: Req) {
    const b = parse(schemas.reset, body);
    return { session: await this.identity.resetPassword(b.email, b.code, b.password, requestMeta(req)).catch(toHttp) };
  }

  /** Requires a session (global guard). */
  @Post("sign-out")
  @HttpCode(204)
  async signOut(@Req() req: Req) {
    const token = bearerToken(req.headers.authorization);
    if (token) await this.identity.signOut(token);
  }

  /** Requires a session. Ends every session for this account, including this one. */
  /** Change the name on the signed-in account. */
  @Patch("name")
  async updateName(@CurrentPrincipal() principal: Principal, @Body() body: unknown, @Req() req: Req) {
    const b = parse(schemas.name, body);
    return this.identity.updateName(principal.accountId, b, requestMeta(req));
  }

  @Post("sign-out-everywhere")
  @HttpCode(200)
  async signOutEverywhere(@CurrentPrincipal() principal: Principal, @Req() req: Req) {
    return { ended: await this.identity.signOutEverywhere(principal.accountId, requestMeta(req)) };
  }
}
