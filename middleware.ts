import { auth } from "@/auth";
import { isAllowedDomain, resolveAccessScope } from "@/lib/authz/access";
import { getCadastroData } from "@/lib/sheets/service";
import { NextResponse } from "next/server";

function redirectAndClearSession(reqUrl: URL, target: string) {
  const response = NextResponse.redirect(new URL(target, reqUrl));
  const cookieNames = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ];
  cookieNames.forEach((name) => {
    response.cookies.set(name, "", { expires: new Date(0), path: "/" });
  });
  return response;
}

export default auth(async (req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const pathname = nextUrl.pathname;
  const email = req.auth?.user?.email?.trim().toLowerCase() ?? "";
  const hasAllowedDomain = email ? isAllowedDomain(email) : false;

  if (pathname.startsWith("/acesso-negado")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/login")) {
    if (isLoggedIn) {
      if (!hasAllowedDomain) {
        return redirectAndClearSession(nextUrl, "/login");
      }
      return NextResponse.redirect(new URL("/lancamento", nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }
  if (!hasAllowedDomain) {
    return redirectAndClearSession(nextUrl, "/login");
  }
  try {
    const cadastro = await getCadastroData();
    const access = resolveAccessScope({ email, cadastro });
    if (!access.isAdmin && access.allowedGestorIds.length === 0) {
      return redirectAndClearSession(nextUrl, "/login");
    }
  } catch {
    return redirectAndClearSession(nextUrl, "/login");
  }

  return NextResponse.next();
});

export const config = {
  /** Com `experimental.nodeMiddleware` no next.config, usa Node e evita sessão quebrada no Edge. */
  runtime: "nodejs",
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
