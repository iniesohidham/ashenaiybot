import { adminApi } from "@/lib/admin-api";
import { BroadcastPanel } from "./broadcast-panel";

export default async function BroadcastPage() {
  const [{ count }, broadcasts] = await Promise.all([adminApi.broadcast.audience(), adminApi.broadcast.list()]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">پیام همگانی</h1>
      <BroadcastPanel initialAudienceCount={count} initialBroadcasts={broadcasts} />
    </div>
  );
}
