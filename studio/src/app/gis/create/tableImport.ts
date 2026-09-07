import type { PointStatus } from "./deliverable";
import { ddmToDecimal, type LngLat } from "./geo";
import type { Attrs } from "./useSurvey";

/**
 * Import survey lines straight from a spreadsheet.
 *
 * Crews already record mooring inspections in Excel — line no., status,
 * comments, start position, end position, and a row of measurements. Retyping
 * 35 lines into a map is slow and error-prone, so instead: copy the rows, paste
 * them here, confirm the column mapping, done.
 *
 * Positions are usually degrees + decimal minutes split across four columns
 * (N°, N', E°, E'), which is why the roles are per-component rather than a
 * single "coordinate" column.
 */
export type ColumnRole =
  | "ignore"
  | "name"
  | "status"
  | "note"
  | "startLatDeg"
  | "startLatMin"
  | "startLonDeg"
  | "startLonMin"
  | "endLatDeg"
  | "endLatMin"
  | "endLonDeg"
  | "endLonMin"
  | "startLat"
  | "startLon"
  | "endLat"
  | "endLon"
  | "attr";

export const ROLE_LABELS: Record<ColumnRole, string> = {
  ignore: "— ignore —",
  name: "Line name / no.",
  status: "Status (Ok/Avvik/Attention)",
  note: "Comment",
  startLatDeg: "Start N°",
  startLatMin: "Start N′ (dec. min)",
  startLonDeg: "Start E°",
  startLonMin: "Start E′ (dec. min)",
  endLatDeg: "End N°",
  endLatMin: "End N′ (dec. min)",
  endLonDeg: "End E°",
  endLonMin: "End E′ (dec. min)",
  startLat: "Start lat (decimal)",
  startLon: "Start lon (decimal)",
  endLat: "End lat (decimal)",
  endLon: "End lon (decimal)",
  attr: "Keep as attribute",
};

/** Roles offered in the mapping dropdowns, in a sensible order. */
export const ROLE_OPTIONS: ColumnRole[] = [
  "ignore",
  "attr",
  "name",
  "status",
  "note",
  "startLatDeg",
  "startLatMin",
  "startLonDeg",
  "startLonMin",
  "endLatDeg",
  "endLatMin",
  "endLonDeg",
  "endLonMin",
  "startLat",
  "startLon",
  "endLat",
  "endLon",
];

export type ParsedTable = {
  header: string[];
  rows: string[][];
};

/** A row is data (not header) once most of its filled cells are numeric. */
function looksNumeric(row: string[]): boolean {
  const filled = row.filter((c) => c !== "");
  if (filled.length === 0) return false;
  const numeric = filled.filter((c) => /^-?[\d\s.,]+$/.test(c)).length;
  return numeric / filled.length > 0.4;
}

/**
 * Square up a grid and work out which leading rows are the header.
 *
 * Inspection sheets routinely use a two-row header with merged cells — a group
 * banner ("Start line of position on Flåte") above the individual columns —
 * which arrives as one row of sparse labels above another. Those rows are
 * collapsed into a single header by taking the lowest non-empty label per
 * column, which is the specific one.
 */
export function normaliseGrid(grid: string[][]): ParsedTable {
  const rows = grid.filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) return { header: [], rows: [] };

  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill("")]);

  // Header = the leading run of non-numeric rows (capped, so a text-heavy
  // sheet can't swallow its own data).
  let headerCount = 0;
  while (headerCount < Math.min(3, padded.length - 1) && !looksNumeric(padded[headerCount])) {
    headerCount++;
  }
  if (headerCount === 0) headerCount = 1;

  const headerRows = padded.slice(0, headerCount);
  const header = Array.from({ length: width }, (_, c) => {
    for (let r = headerRows.length - 1; r >= 0; r--) {
      if (headerRows[r][c]) return headerRows[r][c];
    }
    return "";
  });

  return { header, rows: padded.slice(headerCount) };
}

/** Split pasted spreadsheet text (TSV from Excel, or CSV) into a grid. */
export function parseTable(text: string): ParsedTable | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const grid = lines.map((l) => l.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, "")));
  return normaliseGrid(grid);
}

/**
 * Guess a role per column from its header text.
 *
 * Position headers repeat (start block, then end block), so the Nth occurrence
 * decides start vs end — matching how these sheets are laid out.
 */
export function guessRoles(header: string[]): ColumnRole[] {
  let latDegSeen = 0;
  let latMinSeen = 0;
  let lonDegSeen = 0;
  let lonMinSeen = 0;

  // name/status/note are single-slot: the first plausible column wins, so a
  // later lookalike ("Actual line length…") can't steal the role.
  const used = new Set<ColumnRole>();
  const once = (role: ColumnRole): ColumnRole => {
    if (used.has(role)) return "attr";
    used.add(role);
    return role;
  };

  return header.map((raw) => {
    const h = raw.toLowerCase();
    if (!h) return "ignore";

    // Word-bounded so "does not allow" doesn't read as a "no." column.
    if (/\b(line|linc|linje)\b/.test(h) && /\b(nr|no|no\.|name|navn|id)\b/.test(h)) {
      return once("name");
    }
    if (/avvik|attention|status/.test(h)) return once("status");
    if (/comment|kommentar|merknad/.test(h)) return once("note");

    const isLat = /\bn[°'′]?\b|nord|lat/.test(h);
    const isLon = /\be[°'′]?\b|øst|ost|lon|long/.test(h);
    const isMin = /minute|minutt|'|′/.test(h);
    const isDeg = /degree|grader|°/.test(h) && !isMin;

    if (isLat && isDeg) return ++latDegSeen === 1 ? "startLatDeg" : "endLatDeg";
    if (isLat && isMin) return ++latMinSeen === 1 ? "startLatMin" : "endLatMin";
    if (isLon && isDeg) return ++lonDegSeen === 1 ? "startLonDeg" : "endLonDeg";
    if (isLon && isMin) return ++lonMinSeen === 1 ? "startLonMin" : "endLonMin";

    // Everything else is real measured data worth keeping.
    return "attr";
  });
}

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const cleaned = String(v).replace(",", ".").replace(/[^\d.\-]/g, "");
  // An empty cell must stay empty — Number("") is 0, which would silently
  // place features at 0°N 0°E instead of skipping the row.
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Norwegian inspection sheets use Ok / Avvik / Attention. */
export function parseStatus(v: string | undefined): PointStatus {
  const s = (v ?? "").toLowerCase();
  if (/avvik|fail|feil/.test(s)) return "fail";
  if (/attention|obs|merk/.test(s)) return "attention";
  return "ok";
}

export type ImportedLine = {
  name: string;
  vertices: LngLat[];
  status: PointStatus;
  note: string;
  attrs: Attrs;
};

export type ImportResult = {
  lines: ImportedLine[];
  /** Rows that could not be turned into a line, with why. */
  skipped: { row: number; reason: string }[];
};

/** Turn mapped rows into lines. Rows lacking a usable start are skipped. */
export function buildLines(
  table: ParsedTable,
  roles: ColumnRole[],
  opts: { namePrefix?: string } = {}
): ImportResult {
  const lines: ImportedLine[] = [];
  const skipped: { row: number; reason: string }[] = [];

  const find = (role: ColumnRole) => roles.indexOf(role);
  const cell = (row: string[], role: ColumnRole) => {
    const i = find(role);
    return i >= 0 ? row[i] : undefined;
  };

  const coord = (
    row: string[],
    degRole: ColumnRole,
    minRole: ColumnRole,
    decRole: ColumnRole
  ): number | null => {
    const dec = num(cell(row, decRole));
    if (dec != null) return dec;
    const d = num(cell(row, degRole));
    const m = num(cell(row, minRole));
    if (d == null) return null;
    return ddmToDecimal(d, m ?? 0);
  };

  table.rows.forEach((row, i) => {
    if (row.every((c) => c === "")) return;

    const startLat = coord(row, "startLatDeg", "startLatMin", "startLat");
    const startLon = coord(row, "startLonDeg", "startLonMin", "startLon");
    const endLat = coord(row, "endLatDeg", "endLatMin", "endLat");
    const endLon = coord(row, "endLonDeg", "endLonMin", "endLon");

    if (startLat == null || startLon == null) {
      skipped.push({ row: i + 1, reason: "no start position" });
      return;
    }

    const vertices: LngLat[] = [[startLon, startLat]];
    if (endLat != null && endLon != null) vertices.push([endLon, endLat]);
    if (vertices.length < 2) {
      skipped.push({ row: i + 1, reason: "no end position" });
      return;
    }

    const attrs: Attrs = {};
    roles.forEach((role, c) => {
      if (role !== "attr") return;
      const key = table.header[c] || `Column ${c + 1}`;
      const v = row[c];
      if (v === "" || v == null) return;
      const n = num(v);
      attrs[key] = n != null && /^[\d.,\s-]+$/.test(v) ? n : v;
    });

    const rawName = cell(row, "name")?.trim();
    lines.push({
      name: rawName ? `${opts.namePrefix ?? ""}${rawName}` : `Line ${lines.length + 1}`,
      vertices,
      status: parseStatus(cell(row, "status")),
      note: cell(row, "note")?.trim() ?? "",
      attrs,
    });
  });

  return { lines, skipped };
}
