import { adminApi } from "@/lib/admin-api";
import { StatTile } from "@/components/stat-tile";

/** US-7.6 — core metrics dashboard. */
export default async function DashboardPage() {
  const metrics = await adminApi.dashboard.metrics();
  const trendDau = metrics.trend.map((t) => t.dau);
  const trendSignups = metrics.trend.map((t) => t.newSignups);
  const trendMatches = metrics.trend.map((t) => t.matchesCreated);
  // EPIC 8 (US-8.3) — new series, backed by the Event table.
  const trendChatsEnded = metrics.trend.map((t) => t.chatsEnded);
  const trendReportsSubmitted = metrics.trend.map((t) => t.reportsSubmitted);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">داشبورد</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="کاربران فعال امروز (DAU)" value={metrics.today.dau} trend={trendDau} />
        <StatTile label="پروفایل‌های جدید امروز" value={metrics.today.newSignups} trend={trendSignups} />
        <StatTile label="مچ‌های جدید امروز" value={metrics.today.matchesCreated} trend={trendMatches} />
        <StatTile label="گفتگوهای پایان‌یافته امروز" value={metrics.today.chatsEnded} trend={trendChatsEnded} />
        <StatTile
          label="گزارش‌های ثبت‌شده امروز"
          value={metrics.today.reportsSubmitted}
          trend={trendReportsSubmitted}
        />
        <StatTile label="گفتگوهای فعال" value={metrics.today.activeSessions} />
        <StatTile label="گزارش‌های در انتظار رسیدگی" value={metrics.today.pendingReports} />
        <StatTile label="عکس‌های در انتظار بررسی" value={metrics.today.pendingPhotos} />
      </div>
    </div>
  );
}
