import { type NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "velaq_session";

/**
 * The signed-in area needs a session cookie. This is only the first check: /app confirms the
 * session with the API on every load, so an ended or revoked session is sent back to sign-in.
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*"] };
