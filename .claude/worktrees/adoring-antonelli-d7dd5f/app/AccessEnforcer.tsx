"use client";

import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const CHECK_INTERVAL_MS = 60_000;

export default function AccessEnforcer() {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const runningRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (pathname.startsWith("/login") || pathname.startsWith("/acesso-negado")) return;

    const validateAccess = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const res = await fetch("/api/cadastro", {
          credentials: "include",
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (res.status === 401 || res.status === 403) {
          await signOut({ redirect: true, callbackUrl: "/login" });
          router.replace("/login");
        }
      } finally {
        runningRef.current = false;
      }
    };

    void validateAccess();

    const onFocus = () => {
      void validateAccess();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void validateAccess();
    };
    const intervalId = window.setInterval(() => {
      void validateAccess();
    }, CHECK_INTERVAL_MS);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, router, status]);

  return null;
}

