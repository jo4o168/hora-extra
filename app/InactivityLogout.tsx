"use client";

import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

function minutesToMs(minutes: number) {
  return Math.max(1, minutes) * 60_000;
}

export default function InactivityLogout() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const timeoutMs = useMemo(() => {
    const raw = (process.env.NEXT_PUBLIC_INACTIVITY_LOGOUT_MINUTES ?? "").trim();
    const n = raw ? Number(raw) : 30;
    return minutesToMs(Number.isFinite(n) ? n : 30);
  }, []);

  const timerRef = useRef<number | null>(null);
  const signedOutRef = useRef(false);

  useEffect(() => {
    // Se o usuário já saiu (expiração/erro) e permaneceu numa rota protegida, garante redirect.
    if (
      status === "unauthenticated" &&
      !pathname.startsWith("/login") &&
      !pathname.startsWith("/acesso-negado")
    ) {
      router.replace("/login");
    }
  }, [pathname, router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    signedOutRef.current = false;

    const reset = () => {
      if (signedOutRef.current) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        signedOutRef.current = true;
        try {
          await signOut({ redirect: true, callbackUrl: "/login" });
        } finally {
          // Fallback: em alguns cenários o redirect do Auth pode não navegar no App Router.
          router.replace("/login");
        }
      }, timeoutMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "pointerdown",
    ];

    reset();
    document.addEventListener("visibilitychange", onVisibility);
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [router, status, timeoutMs]);

  return null;
}

