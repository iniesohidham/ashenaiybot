import Link from "next/link";
import { adminApi } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_LABELS: Record<string, string> = { active: "فعال", banned: "بن‌شده", deleted: "حذف‌شده" };

/** US-7.4 — "search by internal user id (never raw Telegram id)". Prefix match on the same id shown here, never anything else. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const results = q ? await adminApi.users.search(q) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">جستجوی کاربران</h1>
      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="شناسه داخلی کاربر (یا ابتدای آن)" className="max-w-sm" />
        <Button type="submit">جستجو</Button>
      </form>

      {q && results.length === 0 ? <p className="text-sm text-muted-foreground">کاربری با این شناسه پیدا نشد.</p> : null}

      <div className="flex flex-col gap-2">
        {results.map((user) => (
          <Link key={user.id} href={`/users/${user.id}`}>
            <Card className="transition-colors hover:bg-accent">
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-mono text-sm">{user.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.gender ?? "—"} · {new Date(user.createdAt).toLocaleDateString("en-US")}
                  </p>
                </div>
                <Badge variant={user.status === "active" ? "outline" : user.status === "banned" ? "destructive" : "default"}>
                  {STATUS_LABELS[user.status]}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
