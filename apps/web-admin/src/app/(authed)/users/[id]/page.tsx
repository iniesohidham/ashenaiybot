import { notFound } from "next/navigation";
import { REPORT_REASON_OPTIONS, type ReportReasonValue } from "@ashena/shared";
import { auth } from "@/auth";
import { AdminApiError, adminApi } from "@/lib/admin-api";
import { BASE_PATH } from "@/lib/base-path";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { UserActions } from "./user-actions";

const STATUS_LABELS: Record<string, string> = { active: "فعال", banned: "بن‌شده", deleted: "حذف‌شده" };
const REASON_LABELS: Record<ReportReasonValue, string> = Object.fromEntries(
  REPORT_REASON_OPTIONS.map((o) => [o.value, o.labelFa]),
) as Record<ReportReasonValue, string>;

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString("en-US") : "—";
}

/** US-7.4 — user detail: profile, match/report/ban history, and (both roles) ban issuance / (admin only) reversal+deletion. */
export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, detail] = await Promise.all([
    auth(),
    adminApi.users.detail(id).catch((err: unknown) => {
      if (err instanceof AdminApiError && err.status === 404) return null;
      throw err;
    }),
  ]);
  if (!detail) notFound();

  const isAdmin = session?.user?.role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold">{detail.user.id}</h1>
          <p className="text-sm text-muted-foreground">
            {detail.user.gender ?? "—"} · عضویت از {fmt(detail.user.createdAt)}
          </p>
        </div>
        <Badge variant={detail.user.status === "active" ? "outline" : detail.user.status === "banned" ? "destructive" : "default"}>
          {STATUS_LABELS[detail.user.status]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            {detail.profile?.photoUrl ? (
              <img src={`${BASE_PATH}/api/photos/${detail.user.id}`} alt="عکس پروفایل" className="h-16 w-16 rounded-full object-cover" />
            ) : null}
            <div>
              <CardTitle>پروفایل</CardTitle>
              <p className="text-sm">{detail.profile?.displayBio || "بدون بیو"}</p>
              <p className="text-xs text-muted-foreground">{detail.profile?.interests.join("، ") || "بدون علاقه‌مندی"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <CardTitle>آمار</CardTitle>
            <p className="text-sm">تعداد مچ‌ها: {detail.matchCount}</p>
            <p className="text-sm">گزارش‌های ثبت‌شده توسط این کاربر: {detail.reportsFiledCount}</p>
            <p className="text-sm">گزارش‌های دریافتی: {detail.reportsReceived.length}</p>
          </CardContent>
        </Card>
        <UserActions userId={detail.user.id} status={detail.user.status} isAdmin={isAdmin} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <CardTitle>گزارش‌های دریافتی</CardTitle>
          {detail.reportsReceived.length === 0 ? (
            <p className="text-sm text-muted-foreground">گزارشی ثبت نشده.</p>
          ) : (
            detail.reportsReceived.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span>
                  {REASON_LABELS[r.reason]} · {fmt(r.createdAt)}
                </span>
                <Badge variant={r.severity === "high" ? "destructive" : "outline"}>{r.status}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <CardTitle>سابقه بن</CardTitle>
          {detail.banRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">سابقه بنی نیست.</p>
          ) : (
            detail.banRecords.map((b) => (
              <div key={b.id} className="flex flex-col gap-0.5 text-sm">
                <span>
                  {b.type === "permanent" ? "دائم" : `موقت (تا ${fmt(b.expiresAt)})`} · {b.reason} · توسط {b.issuedByAdmin.username}
                </span>
                <span className="text-xs text-muted-foreground">{fmt(b.createdAt)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {detail.banAppeals.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <CardTitle>درخواست‌های تجدیدنظر</CardTitle>
            {detail.banAppeals.map((a) => (
              <div key={a.id} className="flex flex-col gap-0.5 text-sm">
                <span>{a.message}</span>
                <span className="text-xs text-muted-foreground">
                  {a.status} · {fmt(a.createdAt)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
