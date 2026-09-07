import type { SurveyPath, SurveyPoint } from "./useSurvey";

export type MudMapOrientation = "portrait" | "landscape";

export type MudMapSheet = {
  id: string;
  title: string;
  center: [number, number];
  /** Printed representative fraction: 1000 means 1:1 000. */
  scale: number;
  orientation: MudMapOrientation;
};

export type GeoBounds = [west: number, south: number, east: number, north: number];

const METRES_PER_DEGREE_LAT = 111_320;

/** Usable map frame on an A4 map sheet after title block and margins. */
export function mapFrameSizeMetres(orientation: MudMapOrientation): [number, number] {
  return orientation === "landscape" ? [0.257, 0.145] : [0.18, 0.205];
}

export function boundsForMudMapSheet(sheet: MudMapSheet): GeoBounds {
  const [frameWidth, frameHeight] = mapFrameSizeMetres(sheet.orientation);
  const groundWidth = frameWidth * Math.max(100, sheet.scale);
  const groundHeight = frameHeight * Math.max(100, sheet.scale);
  const latitudeRadians = (sheet.center[1] * Math.PI) / 180;
  const metresPerDegreeLng = Math.max(1, METRES_PER_DEGREE_LAT * Math.cos(latitudeRadians));
  const halfLng = groundWidth / metresPerDegreeLng / 2;
  const halfLat = groundHeight / METRES_PER_DEGREE_LAT / 2;
  return [
    sheet.center[0] - halfLng,
    sheet.center[1] - halfLat,
    sheet.center[0] + halfLng,
    sheet.center[1] + halfLat,
  ];
}

export function estimateScaleFromBounds(
  bounds: GeoBounds,
  orientation: MudMapOrientation
): number {
  const centerLat = (bounds[1] + bounds[3]) / 2;
  const metresPerDegreeLng = Math.max(
    1,
    METRES_PER_DEGREE_LAT * Math.cos((centerLat * Math.PI) / 180)
  );
  const groundWidth = Math.max(1, (bounds[2] - bounds[0]) * metresPerDegreeLng);
  const groundHeight = Math.max(1, (bounds[3] - bounds[1]) * METRES_PER_DEGREE_LAT);
  const [frameWidth, frameHeight] = mapFrameSizeMetres(orientation);
  return roundPracticalScale(Math.max(groundWidth / frameWidth, groundHeight / frameHeight));
}

export function roundPracticalScale(value: number): number {
  const raw = Math.max(100, Math.ceil(value));
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function surveyBounds(points: SurveyPoint[], paths: SurveyPath[]): GeoBounds | null {
  const coordinates: [number, number][] = [
    ...points.map((point) => [point.lng, point.lat] as [number, number]),
    ...paths.flatMap((path) => path.vertices),
  ].filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (coordinates.length === 0) return null;
  let west = coordinates[0][0];
  let south = coordinates[0][1];
  let east = west;
  let north = south;
  for (const [lng, lat] of coordinates.slice(1)) {
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  }
  if (west === east) {
    west -= 0.0005;
    east += 0.0005;
  }
  if (south === north) {
    south -= 0.0005;
    north += 0.0005;
  }
  return [west, south, east, north];
}

export function mudMapSheetFromBounds(
  id: string,
  title: string,
  bounds: GeoBounds,
  orientation: MudMapOrientation = "landscape"
): MudMapSheet {
  return {
    id,
    title,
    center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
    scale: estimateScaleFromBounds(bounds, orientation),
    orientation,
  };
}

/** Split a large job into an overlapping, row-major drawing set. */
export function tileMudMapSheets(
  bounds: GeoBounds,
  scale: number,
  orientation: MudMapOrientation = "landscape",
  overlap = 0.1,
  maxSheets = 200
): MudMapSheet[] {
  const center: [number, number] = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  const probe: MudMapSheet = { id: "probe", title: "", center, scale, orientation };
  const frame = boundsForMudMapSheet(probe);
  const frameWidth = frame[2] - frame[0];
  const frameHeight = frame[3] - frame[1];
  const stepX = frameWidth * (1 - overlap);
  const stepY = frameHeight * (1 - overlap);
  const columns = Math.max(1, Math.ceil(Math.max(0, bounds[2] - bounds[0] - frameWidth) / stepX) + 1);
  const rows = Math.max(1, Math.ceil(Math.max(0, bounds[3] - bounds[1] - frameHeight) / stepY) + 1);
  const sheetCount = columns * rows;
  if (sheetCount > maxSheets) {
    throw new RangeError(
      `This extent needs ${sheetCount} map pages at 1:${Math.round(scale).toLocaleString("en-US")}. Choose a larger scale denominator or add page extents manually.`
    );
  }
  const sheets: MudMapSheet[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const lng = columns === 1
        ? center[0]
        : Math.min(bounds[2] - frameWidth / 2, bounds[0] + frameWidth / 2 + column * stepX);
      const lat = rows === 1
        ? center[1]
        : Math.max(bounds[1] + frameHeight / 2, bounds[3] - frameHeight / 2 - row * stepY);
      const number = sheets.length + 1;
      sheets.push({
        id: `map-${Date.now()}-${number}`,
        title: `Mud map ${number}`,
        center: [lng, lat],
        scale,
        orientation,
      });
    }
  }
  return sheets;
}

export function formatScale(scale: number): string {
  return `1:${Math.round(scale).toLocaleString("en-US").replace(/,/g, " ")}`;
}
