import { useState } from "react";

import {
  basemapLabel,
  getBasemapThumbnail,
  type BasemapId,
} from "../../maps/basemaps";
import "./BasemapSwitcher.css";

const DEFAULT_OPTIONS: BasemapId[] = ["hybrid", "light", "nautical", "topo"];

type Props = {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
  /** Which basemaps to offer. Defaults to the four operational ones. */
  options?: BasemapId[];
};

/**
 * Bottom-left basemap picker, Google-Maps style.
 *
 * Collapsed, it's a single thumbnail of the current basemap; hovering (or
 * tapping) expands it into a labelled row. Pure chrome — it takes the current
 * value and a setter, so any app can drop it beside a <MapCanvas>.
 */
export function BasemapSwitcher({ value, onChange, options = DEFAULT_OPTIONS }: Props) {
  const [open, setOpen] = useState(false);

  const thumb = (id: BasemapId, expanded: boolean) => (
    <button
      key={id}
      type="button"
      className={`gis-bm-thumb${id === value ? " active" : ""}`}
      aria-pressed={id === value}
      aria-label={`${basemapLabel(id)} basemap`}
      onClick={() => {
        onChange(id);
        setOpen(false);
      }}
    >
      <img src={getBasemapThumbnail(id)} alt="" loading="lazy" draggable={false} />
      <span className="gis-bm-label">{basemapLabel(id)}</span>
      {!expanded && <span className="gis-bm-caret" aria-hidden="true">⛶</span>}
    </button>
  );

  return (
    <div
      className={`gis-basemaps${open ? " open" : ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open ? (
        <div className="gis-bm-row" role="group" aria-label="Basemap">
          {options.map((id) => thumb(id, true))}
        </div>
      ) : (
        thumb(value, false)
      )}
    </div>
  );
}
