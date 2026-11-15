import { NextResponse } from "next/server";
import { ApiUnreachable, apiFetch, pdfResponse } from "../../../../../../lib/api";
import { PROFILE_PATH } from "../../../../../../lib/profile";
import { sessionToken } from "../../../../../../lib/session";

/** Downloads a tailored version as a PDF, in the design given by ?template= or the one in use. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await sessionToken();
  if (!token) return NextResponse.redirect(new URL(`/sign-in?next=${PROFILE_PATH}`, req.url));
  const template = new URL(req.url).searchParams.get("template");
  const query = template && /^(classic|modern|sidebar)$/.test(template) ? `?template=${template}` : "";
  try {
    const r = await apiFetch("GET", `/v1/profile/versions/${encodeURIComponent(id)}/cv.pdf${query}`, { token });
    if (r.status === 401) return NextResponse.redirect(new URL(`/sign-in?next=${PROFILE_PATH}`, req.url));
    if (!r.ok) return new NextResponse("That CV couldn't be made. Go back and try again.", { status: r.status, headers: { "content-type": "text/plain; charset=utf-8" } });
    return pdfResponse(r);
  } catch (e) {
    if (e instanceof ApiUnreachable) return new NextResponse("Velaq can't be reached right now. Try again in a moment.", { status: 503 });
    throw e;
  }
}
