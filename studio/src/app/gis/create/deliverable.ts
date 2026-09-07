/**
 * The deliverable model — one dataset, many outputs.
 *
 * Borrowed thinking:
 *  - CAD title blocks: every drawing carries project / ref / rev / date / author
 *    in a standard corner block — that's what makes a pile of drawings read as
 *    one professional set. `DeliverableMeta` is our title block.
 *  - Survey123 / Field Maps: field capture is form-driven — a point isn't just
 *    a location, it's location + category + status + note (+ photos later).
 *  - QGIS print layouts: the report is assembled from standard blocks.
 */

import { RINGASUND_LOGO } from "../assets/ringasundLogo";

export type PointCategory =
  | "observation"
  | "checkpoint"
  | "anchor"
  | "buoy"
  | "shackle"
  | "hazard";

export type PointStatus = "ok" | "attention" | "fail";

export const CATEGORIES: { id: PointCategory; label: string; icon: string }[] = [
  { id: "observation", label: "Observation", icon: "◎" },
  { id: "checkpoint", label: "Checkpoint", icon: "◈" },
  { id: "anchor", label: "Anchor", icon: "⚓" },
  { id: "buoy", label: "Buoy", icon: "●" },
  { id: "shackle", label: "Shackle", icon: "∞" },
  { id: "hazard", label: "Hazard", icon: "⚠" },
];

export const STATUSES: { id: PointStatus; label: string; color: string }[] = [
  { id: "ok", label: "OK", color: "#2a9d8f" },
  { id: "attention", label: "Attention", color: "#e9c46a" },
  { id: "fail", label: "Fail", color: "#e63946" },
];

export type DeliverableMeta = {
  /** Our own mark, shown on every deliverable. Data URL so exports stay standalone. */
  contractorLogo?: string;
  /** The client's mark, uploaded per job. */
  clientLogo?: string;
  title: string;
  reference: string;
  client?: string;
  site: string;
  siteNumber?: string;
  vessel: string;
  author: string;
  checkedBy?: string;
  software?: string;
  operators?: string;
  sourceFiles?: string;
  date: string; // ISO yyyy-mm-dd
  revision: string;
};

export function defaultMeta(): DeliverableMeta {
  return {
    contractorLogo: RINGASUND_LOGO,
    title: "",
    reference: "",
    client: "",
    site: "",
    siteNumber: "",
    vessel: "",
    author: "",
    checkedBy: "",
    software: "",
    operators: "",
    sourceFiles: "",
    date: new Date().toISOString().slice(0, 10),
    revision: "A",
  };
}

export function statusColor(s: PointStatus): string {
  return STATUSES.find((x) => x.id === s)?.color ?? "#2a9d8f";
}

export function categoryLabel(c: PointCategory): string {
  return CATEGORIES.find((x) => x.id === c)?.label ?? c;
}
