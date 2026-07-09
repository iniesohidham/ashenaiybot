"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { backButton, init, initData, retrieveLaunchParams, themeParams } from "@telegram-apps/sdk";
import { OUTSIDE_TELEGRAM_BODY, OUTSIDE_TELEGRAM_TITLE } from "@/lib/copy";
import { setInitDataRaw } from "@/lib/telegram";
import { BackButtonController } from "@/components/back-button-controller";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 } },
});

type LaunchState = "loading" | "ready" | "unavailable";

/** Perceived luminance (ITU-R BT.601) off Telegram's own bg color — themeParams exposes colors, not a ready-made isDark boolean, so darkness is derived from the color actually being used. */
function isColorDark(hex: string | undefined): boolean {
  if (!hex || hex.length !== 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/**
 * US-6.1: initializes @telegram-apps/sdk, reads Telegram's theme to set the
 * initial light/dark mode (globals.css's :root[data-theme] override), and
 * shows a graceful error state instead of the app when opened outside
 * Telegram — retrieveLaunchParams() throwing is the SDK's documented signal
 * for that case, not a bug to guard against defensively.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LaunchState>("loading");

  useEffect(() => {
    try {
      retrieveLaunchParams();
    } catch {
      // Dev-only visual QA bypass: opening this app outside Telegram is
      // normally a dead end (see the "unavailable" branch below, which is
      // the real US-6.1 behavior and must stay the default). NODE_ENV
      // itself gates this out of any production build regardless of env
      // vars, and NEXT_PUBLIC_DEV_INIT_DATA (a freshly-signed mock initData
      // string, see apps/web-miniapp/scripts/mock-init-data.ts) must also
      // be explicitly set for it to activate — plain `pnpm dev` with no
      // such var still shows the real outside-Telegram screen.
      if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_INIT_DATA) {
        setInitDataRaw(process.env.NEXT_PUBLIC_DEV_INIT_DATA);
        setState("ready");
        return;
      }
      setState("unavailable");
      return;
    }

    init();

    themeParams.mount.ifAvailable();
    themeParams.bindCssVars.ifAvailable();
    backButton.mount.ifAvailable();

    const dark = isColorDark(themeParams.backgroundColor());
    document.documentElement.dataset.theme = dark ? "dark" : "light";

    setInitDataRaw(initData.raw() ?? null);
    setState("ready");
  }, []);

  if (state === "loading") {
    return null;
  }

  if (state === "unavailable") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-lg font-semibold">{OUTSIDE_TELEGRAM_TITLE}</h1>
        <p className="text-sm text-muted-foreground">{OUTSIDE_TELEGRAM_BODY}</p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BackButtonController />
      {children}
    </QueryClientProvider>
  );
}
