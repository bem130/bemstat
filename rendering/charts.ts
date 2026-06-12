import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

type MetricBucket = {
  name?: string;
  fullName?: string;
  files: number;
  lines: number;
  bytes: number;
  source?: number;
  document?: number;
  test?: number;
};

type MetricsPayload = {
  byOwner: MetricBucket[];
  byRepository: MetricBucket[];
  byExtension: MetricBucket[];
  byLanguage: MetricBucket[];
  byContentKind: MetricBucket[];
};

type ChartSpec = {
  id: string;
  title: string;
  rows: Array<{ label: string; value: number }>;
  unit: string;
};

const PALETTE = ["#1f6feb", "#238636", "#d29922", "#cf222e", "#8250df", "#0a7ea4", "#9a6700", "#6e7781"];

export function writeStaticCharts(metrics: MetricsPayload, outputRoot: string): string[] {
  const imageDir = resolve(outputRoot, "metrics", "images");
  mkdirSync(imageDir, { recursive: true });
  const specs = chartSpecs(metrics);
  const written: string[] = [];

  for (const spec of specs) {
    const svgPath = resolve(imageDir, `${spec.id}.svg`);
    const pngPath = resolve(imageDir, `${spec.id}.png`);
    const svg = renderSvgBarChart(spec);
    writeFileSync(svgPath, svg, "utf8");
    writeFileSync(pngPath, new Resvg(svg).render().asPng());
    written.push(svgPath, pngPath);
  }

  return written;
}

function chartSpecs(metrics: MetricsPayload): ChartSpec[] {
  return [
    {
      id: "owners-by-lines",
      title: "Lines by Owner",
      rows: topRows(metrics.byOwner, "lines", 10),
      unit: "lines",
    },
    {
      id: "top-repositories-by-lines",
      title: "Top Repositories by Lines",
      rows: topRows(metrics.byRepository, "lines", 15, (item) => item.fullName ?? item.name ?? ""),
      unit: "lines",
    },
    {
      id: "top-extensions-by-lines",
      title: "Top Extensions by Lines",
      rows: topRows(metrics.byExtension, "lines", 15),
      unit: "lines",
    },
    {
      id: "top-languages-by-lines",
      title: "Top Languages by Lines",
      rows: topRows(metrics.byLanguage, "lines", 15),
      unit: "lines",
    },
    {
      id: "content-kind-lines",
      title: "Lines by Content Kind",
      rows: topRows(metrics.byContentKind, "lines", 10),
      unit: "lines",
    },
  ];
}

function topRows(
  buckets: MetricBucket[],
  metric: keyof Pick<MetricBucket, "files" | "lines" | "bytes">,
  limit: number,
  label = (item: MetricBucket) => item.name ?? item.fullName ?? "",
): Array<{ label: string; value: number }> {
  return [...buckets]
    .map((item) => ({ label: label(item), value: Number(item[metric] ?? 0) }))
    .filter((item) => item.label.length > 0 && item.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function renderSvgBarChart(spec: ChartSpec): string {
  const width = 1200;
  const rowHeight = 34;
  const top = 72;
  const left = 280;
  const right = 170;
  const bottom = 38;
  const height = Math.max(260, top + bottom + spec.rows.length * rowHeight);
  const max = Math.max(1, ...spec.rows.map((row) => row.value));
  const chartWidth = width - left - right;

  const bars = spec.rows.map((row, index) => {
    const y = top + index * rowHeight;
    const barWidth = Math.max(1, Math.round((row.value / max) * chartWidth));
    const color = PALETTE[index % PALETTE.length];
    return [
      `<text x="${left - 12}" y="${y + 21}" text-anchor="end" class="label">${escapeXml(truncate(row.label, 34))}</text>`,
      `<rect x="${left}" y="${y + 6}" width="${barWidth}" height="20" rx="3" fill="${color}"/>`,
      `<text x="${left + barWidth + 10}" y="${y + 21}" class="value">${formatNumber(row.value)}</text>`,
    ].join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.title)}">
  <style>
    .title { font: 700 28px Arial, sans-serif; fill: #1f2328; }
    .subtitle { font: 14px Arial, sans-serif; fill: #57606a; }
    .label { font: 14px Arial, sans-serif; fill: #24292f; }
    .value { font: 13px Arial, sans-serif; fill: #57606a; }
    .axis { stroke: #d0d7de; stroke-width: 1; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="32" y="42" class="title">${escapeXml(spec.title)}</text>
  <text x="32" y="64" class="subtitle">Generated from repo_metrics.json, unit: ${escapeXml(spec.unit)}</text>
  <line x1="${left}" y1="${top - 8}" x2="${left}" y2="${height - bottom + 2}" class="axis"/>
  ${bars}
</svg>
`;
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}...`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
