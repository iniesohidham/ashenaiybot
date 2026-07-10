"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { REPORT_SEVERITY_OPTIONS } from "@ashena/shared";
import type { BannedPatternDto, ReportSeverity } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deletePatternAction, updatePatternAction } from "./actions";

export function PatternRow({ pattern }: { pattern: BannedPatternDto }) {
  const [text, setText] = useState(pattern.pattern);
  const [severity, setSeverity] = useState<ReportSeverity>(pattern.severity);
  const [isPending, startTransition] = useTransition();
  const dirty = text !== pattern.pattern || severity !== pattern.severity;

  return (
    <div className="flex items-center gap-2 border-b border-border py-2 last:border-b-0">
      <Input value={text} onChange={(e) => setText(e.target.value)} className="flex-1" />
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
        size="sm"
        variant="outline"
        disabled={!dirty || isPending || !text.trim()}
        onClick={() => startTransition(async () => updatePatternAction(pattern.id, text.trim(), severity))}
      >
        ذخیره
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(async () => deletePatternAction(pattern.id))}
        className="text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
