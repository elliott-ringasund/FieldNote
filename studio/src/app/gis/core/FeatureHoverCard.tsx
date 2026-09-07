import { useEffect, useRef, useState } from "react";
import type { MapMouseEvent } from "maplibre-gl";

import type { TrackedAssetPosition } from "../../../api/maps";
import { useMapContext } from "./MapContext";
import "./FeatureHoverCard.css";

type Props = {
  assets: TrackedAssetPosition[];
  /** Point layers to hover-test (site/vessel points). */
  layerIds: string[];
  onViewDetails: (asset: TrackedAssetPosition) => void;
};

type Hover = { asset: TrackedAssetPosition; x: number; y: number };

/**
 * Hover peek: name · owner · coordinates + a "View details" button.
 *
 * Anchored to the feature (not the cursor) so it stays put while you move up to
 * the button; a short hide delay bridges the gap between feature and card.
 * "View details" hands off to the full inspector.
 */
export function FeatureHoverCard({ assets, layerIds, onViewDetails }: Props) {
  const { map, ready } = useMapContext();
  const [hover, setHover] = useState<Hover | null>(null);
  const hideTimer = useRef<number | null>(null);

  const cancelHide = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setHover(null), 160);
  };

  useEffect(() => {
    if (!map || !ready) return;
    const onMove = (e: MapMouseEvent) => {
      const layers = layerIds.filter((id) => map.getLayer(id));
      if (layers.length === 0) return;
      const feats = map.queryRenderedFeatures(e.point, { layers });
      if (feats.length === 0) {
        scheduleHide();
        return;
      }
      const asset = assets.find((a) => a.assetId === feats[0].properties?.assetId);
      if (!asset) {
        scheduleHide();
        return;
      }
      cancelHide();
      const p = map.project([asset.longitude, asset.latitude]);
      setHover({ asset, x: p.x, y: p.y });
    };

    map.on("mousemove", onMove);
    return () => {
      map.off("mousemove", onMove);
      cancelHide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ready, assets, layerIds.join(",")]);

  if (!hover) return null;
  const a = hover.asset;

  return (
    <div
      className="fhc"
      style={{ left: hover.x, top: hover.y }}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      <div className="fhc-name">{a.name}</div>
      <dl className="fhc-kv">
        {a.companyName && (
          <>
            <dt>Owner</dt>
            <dd>{a.companyName}</dd>
          </>
        )}
        <dt>Position</dt>
        <dd>
          {a.latitude.toFixed(4)}, {a.longitude.toFixed(4)}
        </dd>
      </dl>
      <button className="fhc-btn" onClick={() => onViewDetails(a)}>
        View details →
      </button>
    </div>
  );
}
