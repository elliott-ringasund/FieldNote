import { useEffect, useState } from "react";
import maplibregl, { type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";

import type { ClientOperator } from "../clients";
import { useMapContext } from "../core/MapContext";

/**
 * Live layers from Fiskeridirektoratet's open aquaculture register, fetched
 * through the dev proxy (`/fdir` → gis.fiskeridir.no — the server sends no
 * CORS headers, so the proxy is required; see vite.config.ts).
 *
 * These are REAL data: the official locality register, per-client filtered
 * views of it, and the NYTEK-certified mooring lines.
 */
const FDIR = "/fdir/server/rest/services/FiskeridirWFS_akva/MapServer";
const BBOX = "4.0,57.5,12.0,66.0";

const SITE_FIELDS =
  "loknr,navn,til_innehavere,kommune,fylke,status_lokalitet,kapasitet_lok,kapasitet_unittype,til_arter,lokalitet_url";

function queryUrl(layerId: number, outFields: string, where = "1=1"): string {
  return (
    `${FDIR}/${layerId}/query?where=${encodeURIComponent(where)}` +
    `&outFields=${encodeURIComponent(outFields)}` +
    `&geometry=${BBOX}&geometryType=esriGeometryEnvelope&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outSR=4326&f=geojson`
  );
}

function useFdirGeoJson(layerId: number, outFields: string, enabled: boolean, where?: string) {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    if (!enabled || data) return;
    let abort = false;
    fetch(queryUrl(layerId, outFields, where))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!abort && d?.type === "FeatureCollection") setData(d);
      })
      .catch(() => {
        /* offline / proxy missing — layer stays empty */
      });
    return () => {
      abort = true;
    };
  }, [enabled, layerId, outFields, where, data]);

  return data;
}

/** Popup content for a register locality — what you need mid-job. */
function sitePopupHtml(p: Record<string, unknown>): string {
  const esc = (v: unknown) =>
    String(v ?? "—")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
  const cap =
    p.kapasitet_lok != null
      ? `${Number(p.kapasitet_lok).toLocaleString("no")} ${esc(p.kapasitet_unittype ?? "")}`
      : "—";
  const url = typeof p.lokalitet_url === "string" && p.lokalitet_url ? p.lokalitet_url : null;
  return `
    <div style="font:13px/1.45 system-ui,sans-serif;min-width:190px">
      <div style="font-weight:700;font-size:14px">${esc(p.navn)}</div>
      <div style="color:#666;font-size:11px;margin-bottom:6px">Lok.nr ${esc(p.loknr)} · ${esc(p.kommune)}</div>
      <div><b>Holder</b><br>${esc(p.til_innehavere)}</div>
      <div style="margin-top:4px"><b>Capacity</b> ${cap}</div>
      <div><b>Species</b> ${esc(p.til_arter)}</div>
      <div><b>Status</b> ${esc(p.status_lokalitet)}</div>
      ${url ? `<div style="margin-top:6px"><a href="${esc(url)}" target="_blank" rel="noopener">Akvakulturregisteret →</a></div>` : ""}
    </div>`;
}

/** Wire a click-popup onto a point layer, cleaned up on unmount. */
function useSitePopup(layerId: string, enabled: boolean) {
  const { map, ready } = useMapContext();

  useEffect(() => {
    if (!map || !ready || !enabled) return;
    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" });

    const onClick = (e: MapMouseEvent) => {
      if (!map.getLayer(layerId)) return;
      const hits = map.queryRenderedFeatures(e.point, { layers: [layerId] });
      if (hits.length === 0) return;
      popup
        .setLngLat(e.lngLat)
        .setHTML(sitePopupHtml(hits[0].properties ?? {}))
        .addTo(map);
    };
    const enter = () => (map.getCanvas().style.cursor = "pointer");
    const leave = () => (map.getCanvas().style.cursor = "");

    map.on("click", onClick);
    map.on("mouseenter", layerId, enter);
    map.on("mouseleave", layerId, leave);
    return () => {
      popup.remove();
      map.off("click", onClick);
      map.off("mouseenter", layerId, enter);
      map.off("mouseleave", layerId, leave);
    };
  }, [map, ready, enabled, layerId]);
}

const SRC_REG = "fdir-localities";
const LYR_REG = "fdir-localities-layer";
const LYR_REG_LABEL = "fdir-localities-label";

/** Official aquaculture localities — green rings with names. */
export function RegisterSitesLayer({ visible }: { visible: boolean }) {
  const { map, ready, styleEpoch } = useMapContext();
  const data = useFdirGeoJson(0, SITE_FIELDS, visible);
  useSitePopup(LYR_REG, visible);

  useEffect(() => {
    if (!map || !ready) return;
    if (!visible || !data) {
      for (const id of [LYR_REG_LABEL, LYR_REG]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SRC_REG)) map.removeSource(SRC_REG);
      return;
    }
    const src = map.getSource(SRC_REG) as GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      return;
    }
    map.addSource(SRC_REG, { type: "geojson", data });
    map.addLayer({
      id: LYR_REG,
      type: "circle",
      source: SRC_REG,
      paint: {
        "circle-color": "rgba(111, 174, 111, 0.25)",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 10],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#6fae6f",
      },
    });
    map.addLayer({
      id: LYR_REG_LABEL,
      type: "symbol",
      source: SRC_REG,
      minzoom: 9,
      layout: {
        "text-field": ["concat", ["get", "navn"], " (", ["to-string", ["get", "loknr"]], ")"],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 10.5,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
      },
      paint: { "text-color": "#d8efd8", "text-halo-color": "#0b1420", "text-halo-width": 1.6 },
    });
  }, [map, ready, visible, data, styleEpoch]);

  return null;
}

/**
 * One client's sites, filtered from the register by licence holder.
 *
 * Styled in the client's colour and labelled from a lower zoom than the full
 * register, so when you're working a job for them their farms stand out from
 * the hundreds of other localities.
 */
export function ClientSitesLayer({
  client,
  visible,
}: {
  client: ClientOperator;
  visible: boolean;
}) {
  const { map, ready, styleEpoch } = useMapContext();
  const src = `fdir-client-${client.id}`;
  const lyr = `${src}-layer`;
  const lyrLabel = `${src}-label`;

  const where = `UPPER(til_innehavere) LIKE '%${client.match}%' AND status_lokalitet='AKTIV'`;
  const data = useFdirGeoJson(0, SITE_FIELDS, visible, where);
  useSitePopup(lyr, visible);

  useEffect(() => {
    if (!map || !ready) return;
    if (!visible || !data) {
      for (const id of [lyrLabel, lyr]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(src)) map.removeSource(src);
      return;
    }
    const existing = map.getSource(src) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
      return;
    }
    map.addSource(src, { type: "geojson", data });
    map.addLayer({
      id: lyr,
      type: "circle",
      source: src,
      paint: {
        "circle-color": client.color,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 6, 14, 12],
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });
    map.addLayer({
      id: lyrLabel,
      type: "symbol",
      source: src,
      minzoom: 7.5,
      layout: {
        "text-field": ["get", "navn"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 11.5,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: { "text-color": "#ffffff", "text-halo-color": "#0b1420", "text-halo-width": 1.8 },
    });
  }, [map, ready, visible, data, styleEpoch, client, src, lyr, lyrLabel]);

  return null;
}

const SRC_NYTEK = "fdir-nytek";
const LYR_NYTEK = "fdir-nytek-layer";

/** NYTEK-certified mooring lines — the permitted layouts, as violet lines. */
export function NytekMooringsLayer({ visible }: { visible: boolean }) {
  const { map, ready, styleEpoch } = useMapContext();
  const data = useFdirGeoJson(93, "status,sertif_til_dato", visible);

  useEffect(() => {
    if (!map || !ready) return;
    if (!visible || !data) {
      if (map.getLayer(LYR_NYTEK)) map.removeLayer(LYR_NYTEK);
      if (map.getSource(SRC_NYTEK)) map.removeSource(SRC_NYTEK);
      return;
    }
    const src = map.getSource(SRC_NYTEK) as GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      return;
    }
    map.addSource(SRC_NYTEK, { type: "geojson", data });
    map.addLayer({
      id: LYR_NYTEK,
      type: "line",
      source: SRC_NYTEK,
      paint: { "line-color": "#b39ddb", "line-width": 1.5, "line-opacity": 0.85 },
    });
  }, [map, ready, visible, data, styleEpoch]);

  return null;
}
