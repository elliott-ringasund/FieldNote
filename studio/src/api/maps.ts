/**
 * Type-only shim for the Fleo backend API module.
 *
 * The studio runs fully standalone — no backend — so only the shared shapes
 * survive here. Keeping the same module path means the gis/ source is a
 * verbatim copy of the Fleo tree and diffs stay meaningful in both directions.
 */

export type TrackedAssetType = "Boat" | "Car" | "Location";

export type TrackedAssetPosition = {
  assetId: number;
  type: TrackedAssetType;
  name: string;
  latitude: number;
  longitude: number;
  sourceTimestamp: string;
  updatedAt: string;
  headingDegrees?: number | null;
  speedKnots?: number | null;
  accuracyMeters?: number | null;
  source?: string | null;
  colorHex?: string | null;
  boatId?: number | null;
  externalId?: string;
  companyName?: string | null;
  reportLocationId?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  feedingCenterPhone?: string | null;
  isActive?: boolean;
  fishHealth?: FishHealthSummary | null;
};

export type FishHealthSummary = {
  summary?: string | null;
  updatedAt?: string | null;
  hasDisease?: boolean;
  hasMapDisease?: boolean;
  mapDiseaseLabel?: string | null;
  diseases?: FishHealthDisease[] | null;
  details?: unknown;
};

export type FishHealthDisease = {
  name?: string | null;
  label?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  subType?: string | null;
  suspicionDate?: string | null;
  diagnosisDate?: string | null;
  closureDate?: string | null;
  isActive: boolean;
  isMapDisease: boolean;
};
