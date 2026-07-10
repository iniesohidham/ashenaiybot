"use client";

import { useState, useTransition } from "react";
import { REPORT_SEVERITY_OPTIONS } from "@ashena/shared";
import type { ReportSeverity } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPatternAction } from "./actions";

export function NewPatternForm() {
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<ReportSeverity>("normal");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="الگوی جدید" className="flex-1" />
      <select
        value={severity}
        onChange={(e) => setSeverity(e.target.value as ReportSeverity)}
        className="h-10 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {REPORT_SEVERITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.labelFa}
          </option>
        ))}
      </select>
      <Button
        disabled={!text.trim() || isPending}
        onClick={() =>
          startTransition(async () => {
            await createPatternAction(text.trim(), severity);
            setText("");
          })
        }
      >
        افزودن
      </Button>
    </div>
  );
}
