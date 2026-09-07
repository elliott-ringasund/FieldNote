import type { TrackedAssetPosition } from "../../../api/maps";
import "./MapSearch.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Ranked matches to show under the field. */
  results: TrackedAssetPosition[];
  onSelect: (asset: TrackedAssetPosition) => void;
  placeholder?: string;
};

/**
 * Top-centre search over sites and vessels, with a results dropdown.
 *
 * Presentational chrome: the page owns the query and the matching, this owns
 * the look and where it sits. Same deal as the basemap switcher — drop it in
 * beside a <MapCanvas> and wire it to state.
 */
export function MapSearch({ value, onChange, results, onSelect, placeholder }: Props) {
  return (
    <div className="mapsearch">
      <div className="mapsearch-bar">
        <span className="mapsearch-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Search sites, vessels, operators…"}
          spellCheck={false}
          autoComplete="off"
          aria-label="Search the map"
        />
        {value && (
          <button className="mapsearch-clear" onClick={() => onChange("")} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>

      {results.length > 0 && (
        <ul className="mapsearch-results">
          {results.map((r) => (
            <li key={`${r.type}-${r.assetId}`}>
              <button onClick={() => onSelect(r)}>
                <span className="mapsearch-name">
                  <span
                    className={`mapsearch-tag ${r.type === "Location" ? "is-site" : "is-vessel"}`}
                  >
                    {r.type === "Location" ? "SITE" : "UNIT"}
                  </span>
                  {r.name}
                </span>
                <span className="mapsearch-meta">
                  {r.externalId ? `NO ${r.externalId}` : r.type.toUpperCase()}
                  {r.companyName ? ` · ${r.companyName}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
