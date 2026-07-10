import { adminApi } from "@/lib/admin-api";
import { Card, CardContent } from "@/components/ui/card";
import { NewPatternForm } from "./new-pattern-form";
import { PatternRow } from "./pattern-row";

/** US-7.5 — banned-word/pattern list management (admin-only). Changes take effect for new messages within moderation/service.ts's 60s pattern cache TTL — modules/admin/service.ts's CRUD functions invalidate it immediately on every write, so in practice it's live right away. */
export default async function PatternsPage() {
  const patterns = await adminApi.patterns.list();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">فیلتر کلمات ممنوعه</h1>
      <Card>
        <CardContent className="p-4">
          <NewPatternForm />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          {patterns.length === 0 ? (
            <p className="text-sm text-muted-foreground">هنوز الگویی ثبت نشده.</p>
          ) : (
            patterns.map((pattern) => <PatternRow key={pattern.id} pattern={pattern} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
