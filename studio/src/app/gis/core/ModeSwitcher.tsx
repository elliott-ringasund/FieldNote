import { MAP_MODES, type MapModeId } from "../modes";
import "./ModeSwitcher.css";

type Props = {
  value: MapModeId;
  onChange: (id: MapModeId) => void;
};

/**
 * Top-left segmented control that switches the map's mode.
 *
 * The primary navigation of the map: Operate / Explore / Create. Purely
 * presentational — the shell owns the active mode and decides what each mode
 * shows.
 */
export function ModeSwitcher({ value, onChange }: Props) {
  return (
    <div className="modeswitch" role="tablist" aria-label="Map mode">
      {MAP_MODES.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            className={`modeswitch-btn${active ? " active" : ""}`}
            onClick={() => onChange(m.id)}
            title={m.tagline}
          >
            <span className="modeswitch-icon" aria-hidden="true">
              {m.icon}
            </span>
            <span className="modeswitch-label">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
