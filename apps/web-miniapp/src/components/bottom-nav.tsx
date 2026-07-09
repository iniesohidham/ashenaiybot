"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, MessageCircle, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_LABELS } from "@/lib/copy";

const ITEMS = [
  { href: "/", label: NAV_LABELS.swipe, icon: Heart },
  { href: "/chat", label: NAV_LABELS.chat, icon: MessageCircle },
  { href: "/profile", label: NAV_LABELS.profile, icon: User },
  { href: "/settings", label: NAV_LABELS.settings, icon: Settings },
] as const;

/**
 * Primary navigation (US-6.1's shell) — Telegram's BackButton
 * (back-button-controller.tsx) is secondary, for drilling out of a screen,
 * not for switching between these four. Edge-to-edge frosted glass (not a
 * floating pill) matches Telegram's own native nav treatment more closely
 * than iOS's — top-corner rounding + a lift shadow gets most of the
 * "elevated surface" feel without the extra vertical space cost or the
 * safe-area risk a floating bar would add in Telegram's WebView.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-glass-border bg-glass-bg pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-12px_rgb(0_0_0_/_0.15)] backdrop-blur-xl backdrop-saturate-150"
    >
      <ul className="flex items-stretch justify-around">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full px-3.5 py-1 transition-colors",
                    active && "bg-primary/10",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
