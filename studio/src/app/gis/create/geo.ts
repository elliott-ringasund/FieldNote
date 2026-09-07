/**
 * Geodesy helpers for survey authoring — COGO-style (coordinate geometry).
 *
 * Spherical earth (R = 6371 km): at mooring scale (tens of metres to a couple
 * of km) the error vs a full ellipsoid model is millimetres — fine for laying
 * out and reporting lines, and it keeps the maths auditable.
 *
 * Bearings are degrees TRUE, 0° = north, clockwise — the convention crews and
 * the existing deliverables already use.
 */

const R = 6371000; // metres
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export type LngLat = [number, number]; // [lng, lat] — GeoJSON order

/** Great-circle distance in metres. */
export function distanceM(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Initial bearing from a to b, degrees true 0–360. */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Destination from `start` along `bearing` (° true) for `distance` metres. */
export function destination(start: LngLat, bearing: number, distance: number): LngLat {
  const [lng1, lat1] = start;
  const δ = distance / R;
  const θ = toRad(bearing);
  const φ1 = toRad(lat1);
  const λ1 = toRad(lng1);
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)];
}

/** Total length of a vertex chain in metres (closing leg included for areas). */
export function pathLengthM(vertices: LngLat[], closed = false): number {
  let total = 0;
  for (let i = 1; i < vertices.length; i++) total += distanceM(vertices[i - 1], vertices[i]);
  if (closed && vertices.length > 2) total += distanceM(vertices[vertices.length - 1], vertices[0]);
  return total;
}

/**
 * Degrees + decimal minutes → decimal degrees.
 *
 * DDM is what marine work actually uses (chart plotters, inspection sheets):
 * 60° 37.757' N is 60 + 37.757/60. Hemisphere letters flip the sign.
 */
export function ddmToDecimal(degrees: number, minutes: number, hemisphere?: string): number {
  const sign = /[SWsw]/.test(hemisphere ?? "") ? -1 : 1;
  return sign * (Math.abs(degrees) + Math.abs(minutes) / 60) * (degrees < 0 ? -1 : 1);
}

/** Decimal degrees → "60° 37.757'" style, the format crews read off plotters. */
export function toDdm(value: number, axis: "lat" | "lng"): string {
  const hemi = value < 0 ? (axis === "lat" ? "S" : "W") : axis === "lat" ? "N" : "E";
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${deg}° ${min.toFixed(3)}' ${hemi}`;
}

export function formatDdmPair(lngLat: LngLat): string {
  return `${toDdm(lngLat[1], "lat")}, ${toDdm(lngLat[0], "lng")}`;
}

/**
 * Parse a typed coordinate pair. Accepts both:
 *  - decimal degrees — "59.79, 5.05" (what the coordinate readout copies)
 *  - degrees + decimal minutes — "60 37.757, 5 0.091", "60°37.757'N 5°0.091'E"
 *
 * DDM is detected by there being two numbers per axis.
 */
export function parseLatLng(text: string): LngLat | null {
  const t = text.trim();
  if (!t) return null;

  // DDM: two numbers (+ optional hemisphere) per axis.
  const ddm = t.match(
    /^\s*(-?\d+)\s*[°\s]\s*(\d+(?:[.,]\d+)?)\s*['′]?\s*([NnSs])?\s*[,;\s]+\s*(-?\d+)\s*[°\s]\s*(\d+(?:[.,]\d+)?)\s*['′]?\s*([EeWw])?\s*$/
  );
  if (ddm) {
    const lat = ddmToDecimal(Number(ddm[1]), Number(ddm[2].replace(",", ".")), ddm[3]);
    const lng = ddmToDecimal(Number(ddm[4]), Number(ddm[5].replace(",", ".")), ddm[6]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return [lng, lat];
  }

  // Plain decimal degrees.
  const dd = t.match(/^(-?\d+(?:\.\d+)?)[,;\s]+(-?\d+(?:\.\d+)?)$/);
  if (!dd) return null;
  const lat = Number(dd[1]);
  const lng = Number(dd[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

export function fmtBearing(deg: number): string {
  return `${Math.round(deg).toString().padStart(3, "0")}°`;
}

export function fmtLength(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
