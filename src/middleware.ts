import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/api/webhooks", "/api/cron"];

function sessionSecret() {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length >= 24) return secret;
  if (process.env.NODE_ENV === "production") return "";
  return "dev-only-ss-software-session-secret";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }
  const token = request.cookies.get("ss_session")?.value;
  const secret = sessionSecret();
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      if (pathname.startsWith("/login")) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      return NextResponse.next();
    } catch {
      // Fall through and ask for a fresh sign-in.
    }
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|samples|icon).*)"],
};
