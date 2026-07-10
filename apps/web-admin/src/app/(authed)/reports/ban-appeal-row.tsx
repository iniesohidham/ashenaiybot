"use client";

import { useTransition } from "react";
import type { BanAppealDto } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveBanAppealAction } from "./actions";

export function BanAppealRow({ appeal }: { appeal: BanAppealDto }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted-foreground">
          کاربر: <span className="font-mono">{appeal.userId}</span>
        </p>
        <p className="text-sm">{appeal.message}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(async () => resolveBanAppealAction(appeal.id, "upheld"))}
          >
            تأیید بن (رد درخواست)
          </Button>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(async () => resolveBanAppealAction(appeal.id, "reversed"))}
          >
            لغو بن
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
