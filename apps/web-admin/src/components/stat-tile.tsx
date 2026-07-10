import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/sparkline";

interface StatTileProps {
  label: string;
  value: number;
  trend?: number[];
}

/** dataviz's stat-tile contract: label (sentence case, no trailing colon), value (proportional figures, not tabular — this is a standalone big number, not a table column), optional trend sparkline. */
export function StatTile({ label, value, trend }: StatTileProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value.toLocaleString("en-US")}</p>
        </div>
        {trend && trend.length > 1 ? <Sparkline values={trend} /> : null}
      </CardContent>
    </Card>
  );
}
