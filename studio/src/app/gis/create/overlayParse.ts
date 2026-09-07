import { ddmToDecimal, type LngLat } from "./geo";

/**
 * Read the survey data an ROV burns into its video overlay.
 *
 * Frames carry a fixed HUD: site + line name bottom-left, position (degrees
 * and decimal minutes) bottom-centre, date/time bottom-right, depth on the
 * right-hand scale. That means a photo already knows which line it belongs to
 * and where it was taken — the operator shouldn't have to retype it.
 *
 * OCR of a video overlay is never clean, but its errors here are *systematic*
 * rather than random: the degree glyph reads as an extra digit (`59°` → `598`),
 * while the minutes come through intact. So rather than trusting the raw text,
 * the degrees are reconciled against where the survey actually is.
 */

/** Regions to OCR, as fractions of the image — frame sizes vary (1258–1400px). */
export const OVERLAY_REGIONS = {
  /** "Koløy L13" — site and line. */
  name: { x: 0.0, y: 0.92, w: 0.3, h: 0.08 },
  /** "N 59° 51.755'  E 5° 17.162'" */
  coords: { x: 0.33, y: 0.88, w: 0.42, h: 0.12 },
  /** "30.07.26 / 12:01:36" */
  datetime: { x: 0.78, y: 0.88, w: 0.22, h: 0.12 },
  /** Depth readout on the right-hand DPT scale. */
  depth: { x: 0.93, y: 0.35, w: 0.07, h: 0.12 },
} as const;

export type OverlayReading = {
  /** Line token found in the overlay, e.g. "L13". */
  lineName?: string;
  position?: LngLat;
  depth?: number;
  timestamp?: string;
  /** What could not be read — surfaced so the operator can fill it in. */
  missing: string[];
};

/** Characters the OCR routinely substitutes for digits in the line number. */
const DIGIT_LOOKALIKES: Record<string, string> = {
  O: "0", o: "0", I: "1", l: "1", "|": "1", Z: "2", z: "2", S: "5", B: "8", g: "9",
};

/**
 * Pull the line token out of the bottom-left caption.
 *
 * The site word OCRs badly ("Koløy" → "Koley", "Kolby"), but the line token is
 * short and digit-led, so it survives. Two allowances matter on real frames:
 * the leading L is sometimes read as a bare stroke ("| 19"), and the digits
 * come back as their letter lookalikes ("L2o" for L20).
 */
export function parseLineName(text: string): string | undefined {
  const re = /([LF|])[^A-Za-z0-9]{0,2}([0-9OoIlZzSBg]{1,2})(?![0-9])/g;
  for (const m of text.matchAll(re)) {
    const letter = m[1] === "|" ? "L" : m[1].toUpperCase();
    const digits = [...m[2]].map((c) => DIGIT_LOOKALIKES[c] ?? c).join("");
    if (/^\d+$/.test(digits) && Number(digits) > 0) {
      return `${letter}${Number(digits)}`;
    }
  }
  return undefined;
}

/**
 * Reconcile an OCR'd degrees value against the degrees we expect.
 *
 * The degree symbol is routinely misread as a trailing digit, so "598" is
 * really 59 and "50" is really 5. Trying successive truncations and keeping the
 * one nearest the expected value recovers it without guessing.
 */
export function reconcileDegrees(raw: string, expected: number): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const candidates = new Set<number>();
  for (let len = 1; len <= digits.length; len++) {
    candidates.add(Number(digits.slice(0, len)));
  }
  let best: number | null = null;
  let bestDelta = Infinity;
  for (const c of candidates) {
    const delta = Math.abs(c - expected);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = c;
    }
  }
  // Only trust it if it lands within a degree of where the survey is; beyond
  // that the read is too corrupt to use and manual entry is safer.
  return best !== null && bestDelta <= 1 ? best : null;
}

/**
 * Parse the coordinate strip.
 *
 * `expected` is the survey's own centre — the anchor that lets a corrupted
 * degrees read be recovered. Without it, only unambiguous reads are accepted.
 */
export function parseOverlayCoords(
  text: string,
  expected?: { lat: number; lng: number }
): LngLat | undefined {
  // Two "degrees minutes" pairs, in N then E order.
  const pairs = [...text.matchAll(/(\d{1,4})\s*[°ºo]?\s*(\d{1,2}[.,]\d{2,3})\s*['′]?/g)];
  if (pairs.length < 2) return undefined;

  const [latPair, lngPair] = pairs;
  const latMin = Number(latPair[2].replace(",", "."));
  const lngMin = Number(lngPair[2].replace(",", "."));
  if (!Number.isFinite(latMin) || !Number.isFinite(lngMin)) return undefined;
  if (latMin >= 60 || lngMin >= 60) return undefined;

  const latDeg = expected
    ? reconcileDegrees(latPair[1], Math.floor(expected.lat))
    : plainDegrees(latPair[1], 90);
  const lngDeg = expected
    ? reconcileDegrees(lngPair[1], Math.floor(expected.lng))
    : plainDegrees(lngPair[1], 180);
  if (latDeg === null || lngDeg === null) return undefined;

  return [ddmToDecimal(lngDeg, lngMin), ddmToDecimal(latDeg, latMin)];
}

/** Without an anchor, accept a degrees read only if it's already in range. */
function plainDegrees(raw: string, max: number): number | null {
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

/**
 * "30.07.26 / 12:01:36" → ISO, assuming dd.mm.yy in this century.
 *
 * The separators OCR as dots whichever they really are, so date and time can't
 * be told apart by punctuation. The overlay stacks date above time, which makes
 * position the reliable discriminator: first token is the date, second the clock.
 */
export function parseOverlayDateTime(text: string): string | undefined {
  const tokens = [...text.matchAll(/(\d{1,2})[.:\-/](\d{1,2})[.:\-/](\d{2,4})/g)];
  if (tokens.length === 0) return undefined;

  const [, day, month, yr] = tokens[0];
  const year = yr.length === 2 ? `20${yr}` : yr.slice(0, 4);

  let time = "00:00:00";
  if (tokens.length > 1) {
    const [, h, mi, s] = tokens[1];
    // A trailing digit sometimes doubles up on the seconds ("13.31.223").
    const sec = s.slice(0, 2);
    if (Number(h) < 24 && Number(mi) < 60 && Number(sec) < 60) {
      time = [h, mi, sec].map((p) => p.padStart(2, "0")).join(":");
    }
  }
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${time}`;
}

/** Depth readout — a bare number of metres. */
export function parseOverlayDepth(text: string): number | undefined {
  const m = text.match(/(\d{1,3}[.,]\d)/) ?? text.match(/\b(\d{1,3})\b/);
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 500 ? n : undefined;
}

/** Assemble one reading from the OCR'd regions, noting whatever failed. */
export function readOverlay(
  raw: { name?: string; coords?: string; datetime?: string; depth?: string },
  expected?: { lat: number; lng: number }
): OverlayReading {
  const lineName = raw.name ? parseLineName(raw.name) : undefined;
  const position = raw.coords ? parseOverlayCoords(raw.coords, expected) : undefined;
  const depth = raw.depth ? parseOverlayDepth(raw.depth) : undefined;
  const timestamp = raw.datetime ? parseOverlayDateTime(raw.datetime) : undefined;

  const missing: string[] = [];
  if (!lineName) missing.push("line");
  if (!position) missing.push("position");
  if (depth === undefined) missing.push("depth");

  return { lineName, position, depth, timestamp, missing };
}
