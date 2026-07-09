"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { backButton } from "@telegram-apps/sdk";

/**
 * US-6.1 AC: "Telegram's native BackButton is wired to in-app navigation
 * instead of the browser back button." Shown on every screen except the
 * root (swipe deck, the bottom-nav's home) — matches the bottom tab nav
 * being the primary navigation, with the hardware/Telegram back button as a
 * secondary way out of a drilled-down screen (chat, profile, settings).
 */
export function BackButtonController() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!backButton.show.isAvailable()) return;

    if (pathname === "/") {
      backButton.hide.ifAvailable();
      return;
    }

    backButton.show();
    const off = backButton.onClick(() => router.back());
    return () => {
      off();
      backButton.hide.ifAvailable();
    };
  }, [pathname, router]);

  return null;
}
