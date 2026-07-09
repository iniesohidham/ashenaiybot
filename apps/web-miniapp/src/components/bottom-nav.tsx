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

/** Primary navigation (US-6.1's shell) — Telegram's BackButton (back-button-controller.tsx) is secondary, for drilling out of a screen, not for switching between these four. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-stretch justify-around">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-xs",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
