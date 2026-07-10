import { adminApi } from "@/lib/admin-api";
import { ReportRow } from "./report-row";
import { BanAppealRow } from "./ban-appeal-row";

/** US-7.2 — report triage queue, plus EPIC 5's ban-appeal queue as a sibling section (see reports.ts route's doc comment). */
export default async function ReportsPage() {
  const [reports, appeals] = await Promise.all([adminApi.reports.list(), adminApi.banAppeals.list()]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">صف گزارش‌ها</h1>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">گزارش در انتظاری نیست.</p>
        ) : (
          reports.map((entry) => <ReportRow key={entry.report.id} entry={entry} />)
        )}
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">درخواست‌های تجدیدنظر بن</h2>
        {appeals.length === 0 ? (
          <p className="text-sm text-muted-foreground">درخواست تجدیدنظری در انتظار نیست.</p>
        ) : (
          appeals.map((appeal) => <BanAppealRow key={appeal.id} appeal={appeal} />)
        )}
      </section>
    </div>
  );
}
