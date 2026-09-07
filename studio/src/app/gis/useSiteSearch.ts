import { useEffect, useState } from "react";

import type { TrackedAssetPosition } from "../../api/maps";

/**
 * Live search over the official aquaculture register.
 *
 * Searching only the layers already on the map is useless when you're trying to
 * *find* a site — you don't know where it is yet. So this queries the register
 * directly by name or locality number, whether or not any layer is loaded.
 *
 * Results are shaped as TrackedAssetPosition so they drop straight into the
 * existing search dropdown.
 */
const FDIR = "/fdir/server/rest/services/FiskeridirWFS_akva/MapServer/0/query";

export function useSiteSearch(query: string, enabled = true): TrackedAssetPosition[] {
  const [results, setResults] = useState<TrackedAssetPosition[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < 2) {
      setResults([]);
      return;
    }

    let abort = false;
    // Debounce — crews type fast and the register is a remote service.
    const timer = window.setTimeout(async () => {
      const safe = q.replace(/'/g, "''").toUpperCase();
      const isNumber = /^\d+$/.test(q);
      const where = isNumber
        ? `loknr = ${q}`
        : `UPPER(navn) LIKE '%${safe}%' AND status_lokalitet = 'AKTIV'`;

      const url =
        `${FDIR}?where=${encodeURIComponent(where)}` +
        `&outFields=${encodeURIComponent("loknr,navn,til_innehavere,kommune")}` +
        `&outSR=4326&resultRecordCount=8&f=geojson`;

      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const d = await r.json();
        if (abort || d?.type !== "FeatureCollection") return;

        const now = new Date().toISOString();
        setResults(
          (d.features ?? [])
            .filter((f: GeoJSON.Feature) => f.geometry?.type === "Point")
            .map((f: GeoJSON.Feature) => {
              const p = (f.properties ?? {}) as Record<string, unknown>;
              const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
              return {
                assetId: Number(p.loknr) || 0,
                type: "Location" as const,
                name: String(p.navn ?? "—"),
                latitude: lat,
                longitude: lng,
                sourceTimestamp: now,
                updatedAt: now,
                externalId: String(p.loknr ?? ""),
                companyName: String(p.til_innehavere ?? ""),
              };
            })
        );
      } catch {
        /* offline — leave results empty */
      }
    }, 250);

    return () => {
      abort = true;
      window.clearTimeout(timer);
    };
  }, [query, enabled]);

  return results;
}
