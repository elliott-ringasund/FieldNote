import { describe, expect, it } from "vitest";

import { defaultMeta } from "./deliverable";
import {
  boundsForMudMapSheet,
  estimateScaleFromBounds,
  mudMapSheetFromBounds,
  surveyBounds,
  tileMudMapSheets,
  type MudMapSheet,
} from "./mudMap";
import { buildReport, defaultReportConfig } from "./reportExport";
import type { SurveyPath, SurveyPoint } from "./useSurvey";

const point: SurveyPoint = {
  id: "pt1",
  name: "Anchor <north>",
  lng: 5.2,
  lat: 59.7,
  category: "anchor",
  status: "attention",
  note: "Inspect shackle",
  photos: [],
};

const line: SurveyPath = {
  id: "ln1",
  name: "L1",
  kind: "line",
  status: "ok",
  note: "",
  photos: [],
  vertices: [[5.2, 59.7], [5.205, 59.704]],
};

describe("mud-map layout", () => {
  it("derives finite survey bounds from points and lines", () => {
    expect(surveyBounds([point], [line])).toEqual([5.2, 59.7, 5.205, 59.704]);
  });

  it("keeps a representative scale round-trippable", () => {
    const sheet: MudMapSheet = {
      id: "one",
      title: "Overview",
      center: [5.2, 59.7],
      scale: 1000,
      orientation: "landscape",
    };
    const bounds = boundsForMudMapSheet(sheet);
    expect(estimateScaleFromBounds(bounds, "landscape")).toBe(1000);
  });

  it("tiles large jobs into multiple overlapping sheets", () => {
    const seed = mudMapSheetFromBounds("seed", "", [5.19, 59.69, 5.21, 59.71]);
    const pages = tileMudMapSheets([5.19, 59.69, 5.21, 59.71], Math.max(250, seed.scale / 3));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.scale >= 250)).toBe(true);
  });

  it("does not silently truncate a generated drawing set", () => {
    const pages = tileMudMapSheets([5.19, 59.69, 5.4, 59.75], 10000);
    expect(pages.length).toBeGreaterThan(24);
    expect(() => tileMudMapSheets([5.19, 59.69, 5.4, 59.75], 250)).toThrow(/needs .* map pages/i);
  });
});

describe("professional report", () => {
  it("renders configured map sheets and escapes field data", () => {
    const meta = { ...defaultMeta(), title: "Inspection <2026>", site: "Koløy", reference: "RGS-1" };
    const config = defaultReportConfig();
    config.mapSheets = [mudMapSheetFromBounds("overview", "Main extent", [5.19, 59.69, 5.21, 59.71])];
    const html = buildReport(meta, [point], [line], config);
    expect(html).toContain("map-sheet landscape");
    expect(html).toContain("Main extent");
    expect(html).toContain("Project details");
    expect(html).toContain("Inspection &lt;2026&gt;");
    expect(html).not.toContain("Anchor <north>");
  });
});
