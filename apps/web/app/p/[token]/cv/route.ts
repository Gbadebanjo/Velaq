import { ApiUnreachable, apiFetch, pdfResponse } from "../../../../lib/api";

/** Downloads a shared profile as a PDF. It contains only the sections the owner chose to share. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const r = await apiFetch("GET", `/v1/shared-profiles/${encodeURIComponent(token)}/cv.pdf`);
    if (!r.ok) return new Response("This profile link isn't active.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    return pdfResponse(r);
  } catch (e) {
    if (e instanceof ApiUnreachable) return new Response("This profile can't be reached right now. Try again in a moment.", { status: 503 });
    throw e;
  }
}
