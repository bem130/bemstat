import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, parse, relative, resolve } from "node:path";
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

type StatPayload = {
  generatedAt?: string;
  owners?: string[];
  repositories?: Array<{ fullName?: string; name?: string }>;
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
  target: string;
  updatedAt: string;
};

type ChartTheme = {
  suffix: "" | "-dark";
  background: string;
  title: string;
  subtitle: string;
  label: string;
  value: string;
  axis: string;
  palette: string[];
};

const THEMES: ChartTheme[] = [
  {
    suffix: "",
    background: "#ffffff",
    title: "#1f2328",
    subtitle: "#57606a",
    label: "#24292f",
    value: "#57606a",
    axis: "#d0d7de",
    palette: ["#1f6feb", "#238636", "#d29922", "#cf222e", "#8250df", "#0a7ea4", "#9a6700", "#6e7781"],
  },
  {
    suffix: "-dark",
    background: "#0d1117",
    title: "#f0f6fc",
    subtitle: "#8b949e",
    label: "#c9d1d9",
    value: "#8b949e",
    axis: "#30363d",
    palette: ["#58a6ff", "#3fb950", "#d29922", "#ff7b72", "#bc8cff", "#39c5cf", "#dbab09", "#8b949e"],
  },
];

export function writeStaticCharts(stat: StatPayload, outputRoot: string): string[] {
  const root = resolve(outputRoot);
  const statDir = resolve(root, "stat");
  const imageDir = resolve(statDir, "images");
  assertSafeOutputRoot(root);
  mkdirSync(root, { recursive: true });
  mkdirSync(statDir, { recursive: true });
  assertSafeImageDir(root, statDir, imageDir);
  rmSync(imageDir, { recursive: true, force: true });
  mkdirSync(imageDir, { recursive: true });
  const specs = chartSpecs(stat);
  const written: string[] = [];

  for (const spec of specs) {
    for (const theme of THEMES) {
      const svgPath = resolve(imageDir, `${spec.id}${theme.suffix}.svg`);
      const pngPath = resolve(imageDir, `${spec.id}${theme.suffix}.png`);
      const svg = renderSvgBarChart(spec, theme);
      writeFileSync(svgPath, svg, "utf8");
      writeFileSync(pngPath, new Resvg(svg).render().asPng());
      written.push(svgPath, pngPath);
    }
  }

  return written;
}

function chartSpecs(stat: StatPayload): ChartSpec[] {
  const target = targetLabel(stat);
  const updatedAt = updatedAtLabel(stat.generatedAt);
  return [
    {
      id: "owners-by-source-lines",
      title: "Source Lines by Owner",
      rows: topRows(stat.byOwner, "source", 10),
      unit: "source lines",
      target,
      updatedAt,
    },
    {
      id: "top-repositories-by-source-lines",
      title: "Top Repositories by Source Lines",
      rows: topRows(stat.byRepository, "source", 15, (item) => item.fullName ?? item.name ?? ""),
      unit: "source lines",
      target,
      updatedAt,
    },
    {
      id: "top-extensions-by-source-lines",
      title: "Top Extensions by Source Lines",
      rows: topRows(stat.byExtension, "source", 15),
      unit: "source lines",
      target,
      updatedAt,
    },
    {
      id: "top-languages-by-source-lines",
      title: "Top Languages by Source Lines",
      rows: topRows(stat.byLanguage, "source", 15),
      unit: "source lines",
      target,
      updatedAt,
    },
    {
      id: "content-kind-lines",
      title: "Lines by Content Kind",
      rows: topRows(stat.byContentKind, "lines", 10),
      unit: "lines",
      target,
      updatedAt,
    },
  ];
}

function targetLabel(stat: StatPayload): string {
  if (stat.owners && stat.owners.length > 0) return stat.owners.join(", ");
  if (stat.repositories && stat.repositories.length > 0) {
    if (stat.repositories.length <= 3) {
      return stat.repositories.map((repo) => repo.fullName ?? repo.name ?? "").filter((name) => name.length > 0).join(", ");
    }
    return `${stat.repositories.length} selected repositories`;
  }
  return "not specified";
}

function updatedAtLabel(generatedAt: string | undefined): string {
  if (generatedAt === undefined) return "unknown";
  const date = new Date(generatedAt);
  if (!Number.isFinite(date.getTime())) return "unknown";
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function topRows(
  buckets: MetricBucket[],
  metric: keyof Pick<MetricBucket, "files" | "lines" | "bytes" | "source">,
  limit: number,
  label = (item: MetricBucket) => item.name ?? item.fullName ?? "",
): Array<{ label: string; value: number }> {
  return [...buckets]
    .map((item) => ({ label: label(item), value: Number(item[metric] ?? 0) }))
    .filter((item) => item.label.length > 0 && item.value > 0)
    .sort((a, b) => {
      if (isUnknownLabel(a.label) !== isUnknownLabel(b.label)) return isUnknownLabel(a.label) ? 1 : -1;
      return b.value - a.value || a.label.localeCompare(b.label);
    })
    .slice(0, limit);
}

function isUnknownLabel(label: string): boolean {
  return label === "unknown" || label === "(no_ext)" || label.startsWith("unknown:");
}

function renderSvgBarChart(spec: ChartSpec, theme: ChartTheme): string {
  const width = 1080;
  const rowHeight = 96;
  const top = 206;
  const marginX = 40;
  const valueColumnWidth = 320;
  const labelValueGap = 24;
  const labelMaxWidth = width - marginX * 2 - valueColumnWidth - labelValueGap;
  const bottom = 56;
  const height = Math.max(260, top + bottom + spec.rows.length * rowHeight);
  const max = Math.max(1, ...spec.rows.map((row) => row.value));
  const chartWidth = width - marginX * 2;

  const bars = spec.rows.map((row, index) => {
    const y = top + index * rowHeight;
    const barWidth = Math.max(1, Math.round((row.value / max) * chartWidth));
    const color = theme.palette[index % theme.palette.length];
    return [
      `<text x="${marginX}" y="${y + 42}" class="label" clip-path="url(#labelClip)">${escapeXml(truncateToSvgWidth(row.label, labelMaxWidth, 46))}</text>`,
      `<text x="${width - marginX}" y="${y + 42}" text-anchor="end" class="value">${formatNumber(row.value)}</text>`,
      `<rect x="${marginX}" y="${y + 60}" width="${barWidth}" height="30" rx="6" fill="${color}"/>`,
    ].join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.title)}">
  <style>
    text { font-family: Arial, sans-serif; }
    .title { font-size: 54px; font-weight: 700; fill: ${theme.title}; }
    .subtitle { font-size: 30px; font-weight: 400; fill: ${theme.subtitle}; }
    .label { font-size: 46px; font-weight: 700; fill: ${theme.label}; }
    .value { font-size: 38px; font-weight: 700; fill: ${theme.value}; }
    .axis { stroke: ${theme.axis}; stroke-width: 1; }
  </style>
  <defs>
    <clipPath id="labelClip">
      <rect x="${marginX}" y="0" width="${labelMaxWidth}" height="${height}"/>
    </clipPath>
  </defs>
  <rect width="100%" height="100%" fill="${theme.background}"/>
  <text x="${marginX}" y="66" class="title">${escapeXml(spec.title)}</text>
  <text x="${marginX}" y="108" class="subtitle">Target: ${escapeXml(truncate(spec.target, 64))}</text>
  <text x="${marginX}" y="144" class="subtitle">Updated: ${escapeXml(spec.updatedAt)}</text>
  <text x="${marginX}" y="180" class="subtitle">Generated from repo_stat.json, unit: ${escapeXml(spec.unit)}</text>
  <line x1="${marginX}" y1="${top - 10}" x2="${width - marginX}" y2="${top - 10}" class="axis"/>
  ${bars}
</svg>
`;
}

function truncate(value: string, length: number): string {
  const chars = Array.from(value);
  return chars.length <= length ? value : `${chars.slice(0, length - 1).join("")}...`;
}

function truncateToSvgWidth(value: string, maxWidth: number, fontSize: number): string {
  const maxUnits = maxWidth / fontSize;
  const chars = Array.from(value);
  if (visualUnits(chars) <= maxUnits) return value;

  const ellipsis = "...";
  const ellipsisUnits = visualUnits(Array.from(ellipsis));
  let output = "";
  let usedUnits = 0;
  for (const char of chars) {
    const nextUnits = visualUnits([char]);
    if (usedUnits + nextUnits + ellipsisUnits > maxUnits) break;
    output += char;
    usedUnits += nextUnits;
  }
  return output.length > 0 ? `${output}${ellipsis}` : ellipsis;
}

function visualUnits(chars: string[]): number {
  return chars.reduce((total, char) => total + visualUnit(char), 0);
}

function visualUnit(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (char === " " || char === "." || char === "," || char === ":" || char === ";" || char === "'" || char === "\"") return 0.32;
  if (char === "/" || char === "-" || char === "_" || char === "|") return 0.42;
  if (code >= 0x30 && code <= 0x39) return 0.58;
  if (char === "W" || char === "M") return 0.95;
  if (char === "w" || char === "m") return 0.82;
  if (code >= 0x41 && code <= 0x5a) return 0.72;
  if (code >= 0x61 && code <= 0x7a) return 0.62;
  if ((code >= 0x3000 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef)) return 1;
  return 0.72;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function escapeXml(value: string): string {
  return xmlSafeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlSafeString(value: string): string {
  let output = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff)
    ) {
      output += char;
    }
  }
  return output;
}

function assertSafeImageDir(root: string, statDir: string, imageDir: string): void {
  if (root === parse(root).root) {
    throw new Error(`refusing to use filesystem root as chart output root: ${root}`);
  }
  const realWorkspace = realpathSync(process.cwd());
  const realRoot = realpathSync(root);
  const realStatDir = realpathSync(statDir);
  const realImageDir = existsSync(imageDir) ? realpathSync(imageDir) : resolve(realStatDir, "images");
  if (
    !isPathInside(realWorkspace, realRoot) ||
    !isPathInside(realRoot, realStatDir) ||
    !isPathInside(realRoot, realImageDir) ||
    imageDir !== resolve(root, "stat", "images")
  ) {
    throw new Error(`unsafe chart image directory: ${imageDir}`);
  }
}

function assertSafeOutputRoot(root: string): void {
  const workspace = resolve(process.cwd());
  const realWorkspace = realpathSync(workspace);
  if (
    root === parse(root).root ||
    !isPathInside(workspace, root) ||
    !isExistingTargetInside(realWorkspace, root)
  ) {
    throw new Error(`unsafe chart output root: ${root}`);
  }
}

function isExistingTargetInside(realWorkspace: string, target: string): boolean {
  if (existsSync(target)) return isPathInside(realWorkspace, realpathSync(target));

  let parent = dirname(target);
  while (!existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent) return false;
    parent = next;
  }
  return isPathInside(realWorkspace, realpathSync(parent));
}

function isPathInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
}
