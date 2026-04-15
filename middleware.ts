import { auth } from "@/auth";
import { isAllowedDomain, resolveAccessScope } from "@/lib/authz/access";
import { getCadastroData } from "@/lib/sheets/service";
import { NextResponse } from "next/server";

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
        return NextResponse.redirect(new URL("/acesso-negado?motivo=dominio", nextUrl));
      }
      return NextResponse.redirect(new URL("/lancamento", nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }
  if (!hasAllowedDomain) {
    return NextResponse.redirect(new URL("/acesso-negado?motivo=dominio", nextUrl));
  }
  try {
    const cadastro = await getCadastroData();
    const access = resolveAccessScope({ email, cadastro });
    if (!access.isAdmin && access.allowedGestorIds.length === 0) {
      return NextResponse.redirect(new URL("/acesso-negado?motivo=permissao", nextUrl));
    }
  } catch {
    return NextResponse.redirect(new URL("/acesso-negado?motivo=configuracao", nextUrl));
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
