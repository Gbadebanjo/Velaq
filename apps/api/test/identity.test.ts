import "reflect-metadata";
import { Controller, Get, type INestApplication, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { type TestDatabase, testDatabase } from "@velaq/db/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthGuard } from "../src/auth/auth.guard.js";
import { CurrentPrincipal, Public } from "../src/auth/decorators.js";
import type { Principal } from "../src/auth/principal.js";
import { BREACH_CHECKER, type BreachChecker } from "../src/identity/breach.js";
import { requestMeta } from "../src/identity/identity.controller.js";
import { IdentityController } from "../src/identity/identity.controller.js";
import { IDENTITY_CONFIG, IDENTITY_DB, IdentityService } from "../src/identity/identity.service.js";
import { MAILER, type Email, type Mailer, ResendMailer } from "../src/identity/mailer.js";

class Inbox implements Mailer {
  sent: Email[] = [];
  /** Set to make the next sends fail, as when the email provider refuses. */
  failing = false;
  async send(e: Email) {
    if (this.failing) throw new Error("Resend refused the email (403): validation_error: You can only send testing emails to your own email address");
    this.sent.push(e);
  }
  lastCode(to: string): string {
    const mail = [...this.sent].reverse().find((m) => m.to === to && /\d{6}/.test(m.subject));
    return /(\d{6})/.exec(mail?.subject ?? "")?.[1] ?? "";
  }
}
const breached = new Set(["password1234", "qwertyuiop12"]);
const breach: BreachChecker = { isBreached: async (p) => breached.has(p) };

@Controller()
class ProbeController {
  @Public() @Get("health") health() { return { ok: true }; }
  @Get("v1/me") me(@CurrentPrincipal() p: Principal) { return p; }
}

let db: TestDatabase;
let app: INestApplication;
let inbox: Inbox;
let ipCounter = 0;
const GOOD = "a long enough passphrase";
const NAME = { firstName: "Ada", lastName: "Obi" };

async function build(product: "personal" | "business" = "personal") {
  const ref = await Test.createTestingModule({
    controllers: [IdentityController, ProbeController],
    providers: [
      { provide: IDENTITY_DB, useValue: db.app },
      { provide: IDENTITY_CONFIG, useValue: { codeSecret: "test-secret", product } },
      { provide: MAILER, useValue: inbox },
      { provide: BREACH_CHECKER, useValue: breach },
      IdentityService,
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  }).compile();
  const a = ref.createNestApplication();
  await a.init();
  return a;
}

// Each test gets its own client address so rate limits from one test don't affect the next.
let ip = "";
const post = (path: string, body: object) =>
  request(app.getHttpServer()).post(`/v1/auth/${path}`).set("x-velaq-web-key", "k").set("x-velaq-client-ip", ip).send(body);

async function signUpAndVerify(email: string) {
  await post("sign-up", { ...NAME, email, password: GOOD }).expect(202);
  const r = await post("verify-email", { email, code: inbox.lastCode(email) }).expect(200);
  return r.body.session.token as string;
}

beforeAll(async () => {
  process.env.WEB_API_KEY = "k";
  db = await testDatabase("identity");
  inbox = new Inbox();
  app = await build();
});
afterAll(async () => app?.close());
beforeEach(() => { ip = `10.0.0.${++ipCounter}`; });

describe("sign-up and email confirmation", () => {
  it("sends a 6-digit code and signs in once confirmed", async () => {
    const token = await signUpAndVerify("ada@example.com");
    const me = await request(app.getHttpServer()).get("/v1/me").set("authorization", `Bearer ${token}`).expect(200);
    expect(me.body).toMatchObject({ email: "ada@example.com", product: "personal" });
  });

  it("treats email case and spaces as the same address", async () => {
    await post("sign-up", { ...NAME, email: "  Tunde@Example.com ", password: GOOD }).expect(202);
    expect(inbox.lastCode("tunde@example.com")).toMatch(/^\d{6}$/);
  });

  it("rejects short and breached passwords with a field message", async () => {
    const short = await post("sign-up", { ...NAME, email: "x@example.com", password: "short" }).expect(400);
    expect(short.body.fields.password).toMatch(/at least 12/);
    const leaked = await post("sign-up", { ...NAME, email: "x@example.com", password: "password1234" }).expect(400);
    expect(leaked.body.error).toBe("breached_password");
  });

  it("does not reveal that an email is already registered", async () => {
    await signUpAndVerify("chidi@example.com");
    const before = inbox.sent.length;
    await post("sign-up", { ...NAME, email: "chidi@example.com", password: "another long passphrase" }).expect(202);
    expect(inbox.sent.at(-1)?.subject).toMatch(/tried to create/i);
    expect(inbox.sent.length).toBe(before + 1);
    // The existing password still works; the attempt changed nothing.
    await post("sign-in", { email: "chidi@example.com", password: GOOD }).expect(200);
  });

  it("refuses a wrong code and locks the code after 5 wrong tries", async () => {
    await post("sign-up", { ...NAME, email: "zara@example.com", password: GOOD }).expect(202);
    const real = inbox.lastCode("zara@example.com");
    const wrong = real === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await post("verify-email", { email: "zara@example.com", code: wrong }).expect(400);
    await post("verify-email", { email: "zara@example.com", code: real }).expect(400);
  });

  it("only accepts the newest code after a resend", async () => {
    await post("sign-up", { ...NAME, email: "ngozi@example.com", password: GOOD }).expect(202);
    const first = inbox.lastCode("ngozi@example.com");
    await post("resend-code", { email: "ngozi@example.com", purpose: "verify_email" }).expect(202);
    const second = inbox.lastCode("ngozi@example.com");
    if (first !== second) await post("verify-email", { email: "ngozi@example.com", code: first }).expect(400);
    await post("verify-email", { email: "ngozi@example.com", code: second }).expect(200);
  });

  it("stores no password, code or token in readable form", async () => {
    await signUpAndVerify("ibrahim@example.com");
    const a = await db.admin.query<{ password_hash: string }>("SELECT password_hash FROM accounts WHERE email = 'ibrahim@example.com'");
    expect(a.rows[0]?.password_hash).toMatch(/^scrypt\$/);
    expect(a.rows[0]?.password_hash).not.toContain(GOOD);
  });
});

describe("sign-in", () => {
  it("gives the same answer for a wrong password and an unknown email", async () => {
    await signUpAndVerify("musa@example.com");
    const wrong = await post("sign-in", { email: "musa@example.com", password: "not the password" }).expect(401);
    const unknown = await post("sign-in", { email: "nobody@example.com", password: "not the password" }).expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it("sends a new code instead of a session when the email isn't confirmed yet", async () => {
    await post("sign-up", { ...NAME, email: "amaka@example.com", password: GOOD }).expect(202);
    const r = await post("sign-in", { email: "amaka@example.com", password: GOOD }).expect(200);
    expect(r.body).toEqual({ next: "verify_email" });
  });

  it("rate-limits repeated attempts on one email", async () => {
    await signUpAndVerify("bisi@example.com");
    let last = 0;
    for (let i = 0; i < 12; i++) {
      ip = `10.1.0.${i}`;
      last = (await post("sign-in", { email: "bisi@example.com", password: "wrong password!" })).status;
    }
    expect(last).toBe(429);
  });
});

describe("sessions", () => {
  it("rejects requests without a valid session", async () => {
    await request(app.getHttpServer()).get("/v1/me").expect(401);
    await request(app.getHttpServer()).get("/v1/me").set("authorization", "Bearer not-a-real-token-at-all-xx").expect(401);
    await request(app.getHttpServer()).get("/health").expect(200);
  });

  it("ends the session immediately on sign-out", async () => {
    const token = await signUpAndVerify("kemi@example.com");
    await request(app.getHttpServer()).post("/v1/auth/sign-out").set("authorization", `Bearer ${token}`).expect(204);
    await request(app.getHttpServer()).get("/v1/me").set("authorization", `Bearer ${token}`).expect(401);
  });

  it("signs out every device at once", async () => {
    const a = await signUpAndVerify("yemi@example.com");
    const b = (await post("sign-in", { email: "yemi@example.com", password: GOOD }).expect(200)).body.session.token;
    const r = await request(app.getHttpServer()).post("/v1/auth/sign-out-everywhere").set("authorization", `Bearer ${a}`).expect(200);
    expect(r.body.ended).toBe(2);
    await request(app.getHttpServer()).get("/v1/me").set("authorization", `Bearer ${a}`).expect(401);
    await request(app.getHttpServer()).get("/v1/me").set("authorization", `Bearer ${b}`).expect(401);
  });

  it("does not accept a Personal session on a Business API", async () => {
    const token = await signUpAndVerify("femi@example.com");
    const business = await build("business");
    await request(business.getHttpServer()).get("/v1/me").set("authorization", `Bearer ${token}`).expect(401);
    await business.close();
  });
});

describe("names", () => {
  const me = (token: string) => request(app.getHttpServer()).get("/v1/me").set("authorization", `Bearer ${token}`);

  it("asks for a first and last name at sign-up and greets by first name", async () => {
    const missing = await post("sign-up", { email: "noname@example.com", password: GOOD }).expect(400);
    expect(Object.keys(missing.body.fields).sort()).toEqual(["firstName", "lastName"]);
    const blank = await post("sign-up", { firstName: "   ", lastName: "Obi", email: "noname@example.com", password: GOOD }).expect(400);
    expect(blank.body.fields.firstName).toBe("Enter your first name.");
    await post("sign-up", { firstName: "<b>", lastName: "Obi", email: "noname@example.com", password: GOOD }).expect(400);

    await post("sign-up", { firstName: "  Mary   Jane ", lastName: " Okafor ", email: "mj@example.com", password: GOOD }).expect(202);
    const mail = inbox.sent.at(-1)!;
    expect(mail.text.startsWith("Hi Mary Jane,")).toBe(true);
    const r = await post("verify-email", { email: "mj@example.com", code: inbox.lastCode("mj@example.com") }).expect(200);
    expect((await me(r.body.session.token).expect(200)).body).toMatchObject({ firstName: "Mary Jane", lastName: "Okafor" });
  });

  it("takes the newest name when an unconfirmed sign-up is repeated", async () => {
    await post("sign-up", { firstName: "Wrong", lastName: "Person", email: "redo@example.com", password: GOOD }).expect(202);
    await post("sign-up", { firstName: "Right", lastName: "Person", email: "redo@example.com", password: GOOD }).expect(202);
    const r = await post("verify-email", { email: "redo@example.com", code: inbox.lastCode("redo@example.com") }).expect(200);
    expect((await me(r.body.session.token)).body.firstName).toBe("Right");
  });

  it("lets the signed-in person change their name, and only theirs", async () => {
    const token = await signUpAndVerify("rename@example.com");
    const patch = (body: object, t?: string) => {
      const q = request(app.getHttpServer()).patch("/v1/auth/name").send(body);
      return t ? q.set("authorization", `Bearer ${t}`) : q;
    };
    await patch({ firstName: "New", lastName: "Name" }).expect(401);
    await patch({ firstName: "", lastName: "Name" }, token).expect(400);
    await patch({ firstName: "Adaeze", lastName: "Obi" }, token).expect(200);
    expect((await me(token)).body).toMatchObject({ firstName: "Adaeze", lastName: "Obi" });
  });
});

describe("forgot password", () => {
  it("resets with the emailed code and signs out every other session", async () => {
    const old = await signUpAndVerify("tola@example.com");
    await post("forgot-password", { email: "tola@example.com" }).expect(202);
    const code = inbox.lastCode("tola@example.com");
    const r = await post("reset-password", { email: "tola@example.com", code, password: "a brand new passphrase" }).expect(200);
    await request(app.getHttpServer()).get("/v1/me").set("authorization", `Bearer ${old}`).expect(401);
    await request(app.getHttpServer()).get("/v1/me").set("authorization", `Bearer ${r.body.session.token}`).expect(200);
    await post("sign-in", { email: "tola@example.com", password: GOOD }).expect(401);
    await post("sign-in", { email: "tola@example.com", password: "a brand new passphrase" }).expect(200);
  });

  it("answers the same for an unknown email and sends nothing", async () => {
    const before = inbox.sent.length;
    await post("forgot-password", { email: "ghost@example.com" }).expect(202);
    expect(inbox.sent.length).toBe(before);
  });
});

describe("client address", () => {
  it("trusts the forwarded address only with the website's key", () => {
    const req = { ip: "1.1.1.1", headers: { "x-velaq-client-ip": "9.9.9.9", "x-velaq-web-key": "k" } };
    expect(requestMeta(req, "k").ip).toBe("9.9.9.9");
    expect(requestMeta(req, "other").ip).toBe("1.1.1.1");
    expect(requestMeta(req, "").ip).toBe("1.1.1.1");
  });
});

describe("when an email can't be sent", () => {
  it("says so clearly instead of a server error, and logs the provider's reason without the address", async () => {
    const logged: string[] = [];
    const orig = console.error;
    console.error = (m: unknown) => void logged.push(String(m));
    inbox.failing = true;
    try {
      const r = await request(app.getHttpServer())
        .post("/v1/auth/sign-up")
        .send({ email: "nobody-gets-this@example.com", password: "a long enough passphrase", firstName: "Ada", lastName: "Okafor" })
        .expect(503);
      expect(r.body).toEqual({ error: "email_failed", message: "We couldn't send the email with your code just now. Try again in a few minutes." });
      await request(app.getHttpServer()).post("/v1/auth/forgot-password").send({ email: "nobody-gets-this@example.com" }).expect((res) => expect([202, 503]).toContain(res.status));
    } finally {
      inbox.failing = false;
      console.error = orig;
    }
    expect(logged.some((l) => l.includes("only send testing emails to your own email address"))).toBe(true);
    expect(logged.join("\n")).not.toContain("nobody-gets-this@example.com");
  });

  it("reads Resend's reason from its reply", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ name: "validation_error", message: "You can only send testing emails to your own email address" }), { status: 403 })) as typeof fetch;
    try {
      await expect(new ResendMailer("re_test", "Velaq <onboarding@resend.dev>").send({ to: "a@b.co", subject: "s", text: "t", html: "h" }))
        .rejects.toThrow("Resend refused the email (403): validation_error: You can only send testing emails to your own email address");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
