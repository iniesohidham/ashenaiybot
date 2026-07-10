interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

/**
 * US-7.6's "each metric has a simple trend visualization" AC — a single-
 * series 7-point sparkline (per dataviz's stat-tile contract: "trend
 * (optional; 12-point sparkline in the de-emphasis hue, current period in
 * the accent)"). One series needs no legend/axes; the SVG's own <title> +
 * aria-label carry the per-point values as this mark's minimal hover/text
 * equivalent instead of a full tooltip component.
 */
export function Sparkline({ values, width = 96, height = 28 }: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => [i * stepX, height - ((v - min) / range) * height] as const);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      role="img"
      aria-label={`روند ${values.length} روز اخیر: ${values.join("، ")}`}
    >
      <title>{values.join(", ")}</title>
      <path d={path} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
      <circle cx={lastX} cy={lastY} r={4} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}
