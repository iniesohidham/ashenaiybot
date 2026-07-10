import type { ReactNode } from "react";
import Link from "next/link";
import { Flag, Image as ImageIcon, LayoutDashboard, LogOut, Megaphone, ShieldAlert, Users } from "lucide-react";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { BASE_PATH } from "@/lib/base-path";

const NAV_ITEMS = [
  { href: "/", label: "داشبورد", icon: LayoutDashboard, adminOnly: false },
  { href: "/reports", label: "گزارش‌ها", icon: Flag, adminOnly: false },
  { href: "/photos", label: "بررسی عکس‌ها", icon: ImageIcon, adminOnly: false },
  { href: "/users", label: "کاربران", icon: Users, adminOnly: false },
  { href: "/patterns", label: "فیلتر کلمات", icon: ShieldAlert, adminOnly: true },
  { href: "/broadcast", label: "پیام همگانی", icon: Megaphone, adminOnly: true },
] as const;

export default async function AuthedLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const role = session?.user?.role;

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-60 shrink-0 flex-col gap-1 border-e border-border p-4">
        <div className="mb-4 px-2">
          <p className="text-sm font-semibold">پنل مدیریت آشنایی</p>
          <p className="text-xs text-muted-foreground">
            {session?.user?.name} · {role === "admin" ? "ادمین" : "ناظر"}
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin").map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <form
          action={async () => {
            "use server";
            // Must be BASE_PATH-prefixed — see login/actions.ts's comment:
            // next-auth's redirectTo resolution drops any path, using just
            // the request's origin, so a plain "/login" would land outside
            // this app (nginx routes bare "/" paths to apps/web-miniapp).
            await signOut({ redirectTo: `${BASE_PATH}/login` });
          }}
        >
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2">
            <LogOut className="h-4 w-4" />
            خروج
          </Button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
