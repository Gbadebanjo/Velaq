import "server-only";
import { headers } from "next/headers";

const base = () => process.env.API_URL ?? "http://localhost:4000";

export interface ApiResult<T = Record<string, unknown>> {
  status: number;
  body: T;
}

/** The API couldn't be reached at all (not running, wrong API_URL, network down). */
export class ApiUnreachable extends Error {}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Call the Velaq API from the website's server and return the raw response. Passes the visitor's
 * address, with the shared WEB_API_KEY, so the API's rate limits apply per visitor rather than to
 * the website as a whole.
 */
export async function apiFetch(method: Method, path: string, opts: { body?: unknown; token?: string } = {}): Promise<Response> {
  const h = await headers();
  const clientIp = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  const reqHeaders: Record<string, string> = {};
  if (opts.body !== undefined) reqHeaders["content-type"] = "application/json";
  if (opts.token) reqHeaders.authorization = `Bearer ${opts.token}`;
  if (process.env.WEB_API_KEY && clientIp) {
    reqHeaders["x-velaq-web-key"] = process.env.WEB_API_KEY;
    reqHeaders["x-velaq-client-ip"] = clientIp;
  }
  const ua = h.get("user-agent");
  if (ua) reqHeaders["user-agent"] = ua;
  try {
    return await fetch(`${base()}${path}`, {
      method,
      headers: reqHeaders,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiUnreachable(base());
  }
}

/** Call the Velaq API and read its JSON answer. */
export async function api<T = Record<string, unknown>>(method: Method, path: string, opts: { body?: unknown; token?: string } = {}): Promise<ApiResult<T>> {
  const res = await apiFetch(method, path, opts);
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T };
}

/** Passes a PDF from the API to the browser as a download, never cached. */
export function pdfResponse(r: Response): Response {
  return new Response(r.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": r.headers.get("content-disposition") ?? 'attachment; filename="CV.pdf"',
      "cache-control": "private, no-store",
    },
  });
}
