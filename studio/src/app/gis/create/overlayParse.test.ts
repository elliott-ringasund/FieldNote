import { describe, expect, it } from "vitest";

import {
  parseLineName,
  parseOverlayCoords,
  parseOverlayDateTime,
  parseOverlayDepth,
  readOverlay,
  reconcileDegrees,
} from "./overlayParse";

/**
 * These strings are verbatim OCR output from the real Koløy ROV frames, not
 * invented samples — including the mangled ones. The point of the parser is to
 * survive exactly this, so the tests must use exactly this.
 */
const KOLOY = { lat: 59.86, lng: 5.29 };

describe("parseLineName", () => {
  it("finds the line despite the site word being misread", () => {
    expect(parseLineName("Koley L13")).toBe("L13");
    expect(parseLineName("Koløy L15")).toBe("L15");
    expect(parseLineName("Koley L24")).toBe("L24");
  });

  it("tolerates a stray separator", () => {
    expect(parseLineName("Kolev L;3")).toBe("L3");
  });

  it("reads F-series lines too", () => {
    expect(parseLineName("Koløy F3")).toBe("F3");
  });

  it("reads digits that came back as their letter lookalikes", () => {
    expect(parseLineName("Koloy L2o")).toBe("L20");
    expect(parseLineName("Koley L2O")).toBe("L20");
    expect(parseLineName("Koio LzO")).toBe("L20");
    expect(parseLineName("Koley L1g")).toBe("L19");
  });

  it("accepts an L that came back as a bare stroke", () => {
    expect(parseLineName("Kolgv | 19")).toBe("L19");
  });

  it("returns nothing when the caption is unreadable", () => {
    expect(parseLineName('1 Kolby L"')).toBeUndefined();
  });
});

describe("reconcileDegrees", () => {
  it("strips the phantom digit the degree glyph adds", () => {
    // "59°" reads as 598 / 599 / 590 depending on the frame.
    expect(reconcileDegrees("598", 59)).toBe(59);
    expect(reconcileDegrees("599", 59)).toBe(59);
    expect(reconcileDegrees("590", 59)).toBe(59);
    // "5°" reads as 59 / 50 / 58.
    expect(reconcileDegrees("59", 5)).toBe(5);
    expect(reconcileDegrees("50", 5)).toBe(5);
    expect(reconcileDegrees("58", 5)).toBe(5);
  });

  it("keeps a clean read unchanged", () => {
    expect(reconcileDegrees("59", 59)).toBe(59);
  });

  it("refuses a read too far from the survey to trust", () => {
    expect(reconcileDegrees("77", 59)).toBeNull();
  });
});

describe("parseOverlayCoords", () => {
  it("recovers the real position from corrupted degrees", () => {
    const got = parseOverlayCoords("598 51.755' E 59 17.162'", KOLOY);
    expect(got).toBeDefined();
    const [lng, lat] = got!;
    expect(lat).toBeCloseTo(59 + 51.755 / 60, 6);
    expect(lng).toBeCloseTo(5 + 17.162 / 60, 6);
  });

  it("handles a comma decimal", () => {
    const got = parseOverlayCoords("599 51,776' N 50 17.251'", KOLOY);
    expect(got![1]).toBeCloseTo(59 + 51.776 / 60, 6);
  });

  it("gives up on a blank strip rather than inventing a position", () => {
    expect(parseOverlayCoords("", KOLOY)).toBeUndefined();
  });

  it("rejects impossible minutes", () => {
    expect(parseOverlayCoords("598 71.755' E 59 17.162'", KOLOY)).toBeUndefined();
  });
});

describe("parseOverlayDateTime / Depth", () => {
  it("reads the stamp as ISO", () => {
    expect(parseOverlayDateTime("30.07.26 12:01:36")).toBe("2026-07-30T12:01:36");
  });

  it("reads a clock whose colons came back as dots", () => {
    // What the real frames actually produce — the separators are indistinguishable.
    expect(parseOverlayDateTime("30.07.26 12.01.36")).toBe("2026-07-30T12:01:36");
    expect(parseOverlayDateTime("28.07.26 18.48.56")).toBe("2026-07-28T18:48:56");
  });

  it("drops a digit that doubled up on the seconds", () => {
    expect(parseOverlayDateTime("29.07.26 13.31.223")).toBe("2026-07-29T13:31:22");
  });

  it("keeps the date when the clock is unreadable", () => {
    expect(parseOverlayDateTime("30.07.26")).toBe("2026-07-30T00:00:00");
  });

  it("reads a decimal depth", () => {
    expect(parseOverlayDepth("9.1")).toBe(9.1);
    expect(parseOverlayDepth("12,4")).toBe(12.4);
  });
});

describe("readOverlay", () => {
  it("assembles a full reading from a good frame", () => {
    const r = readOverlay(
      { name: "Koley L13", coords: "598 51.755' E 59 17.162'", datetime: "30.07.26 12:01:36", depth: "9.1" },
      KOLOY
    );
    expect(r.lineName).toBe("L13");
    expect(r.position).toBeDefined();
    expect(r.depth).toBe(9.1);
    expect(r.missing).toEqual([]);
  });

  it("reports what it could not read instead of failing silently", () => {
    const r = readOverlay({ name: '1 Kolby L"', coords: "" }, KOLOY);
    expect(r.missing).toContain("line");
    expect(r.missing).toContain("position");
  });
});
