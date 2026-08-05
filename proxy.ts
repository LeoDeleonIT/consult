import { NextRequest, NextResponse } from "next/server";
import { readSessionToken, sessionCookie } from "@/lib/session-token";

export async function proxy(request: NextRequest) {
  const session = await readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  const path = request.nextUrl.pathname;
  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  if (path.startsWith("/manager") && session.role !== "manager") {
    return NextResponse.redirect(new URL("/coordinator", request.url));
  }
  if (path.startsWith("/coordinator") && session.role !== "coordinator") {
    return NextResponse.redirect(new URL("/manager", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/coordinator/:path*", "/manager/:path*"],
};
