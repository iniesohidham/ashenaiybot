export default function ForbiddenPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-lg font-semibold">دسترسی نداری</h1>
      <p className="text-sm text-muted-foreground">این بخش فقط در دسترس نقش «ادمین»‌ه، نه «ناظر».</p>
    </div>
  );
}
