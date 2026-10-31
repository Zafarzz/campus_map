import { useMap } from '../state/MapProvider';
import { cinematic, useCinematic } from './cinematicStore';
import { PRESET_ICONS } from './icons';
import { PRESETS } from './presets';

/** Preset grid + building picker for presets that work around a building. */
export function CameraPresets() {
  const { campus, geometry, selection } = useMap();
  const presetId = useCinematic((s) => s.presetId);
  const freeFlight = useCinematic((s) => s.freeFlight);
  const chosen = useCinematic((s) => s.presetBuildingId);
  const buildingId =
    (chosen && geometry.buildings[chosen] ? chosen : undefined) ??
    (selection.buildingId && geometry.buildings[selection.buildingId] ? selection.buildingId : undefined) ??
    campus.buildings.find((b) => geometry.buildings[b.id])?.id ??
    '';

  return (
    <div>
      <label className="cine-field">
        <span>Subject building</span>
        <select value={buildingId} onChange={(e) => cinematic.setPresetBuilding(e.target.value)}>
          {campus.buildings.filter((b) => geometry.buildings[b.id]).map((b) => (
            <option key={b.id} value={b.id}>{b.shortName} — {b.name}</option>
          ))}
        </select>
      </label>
      <div className="cine-presets">
        {PRESETS.map((p) => {
          const active = p.id === 'freeFlight' ? freeFlight : presetId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`cine-preset${active ? ' is-on' : ''}`}
              title={p.description}
              onClick={() => (p.id === 'freeFlight' && freeFlight ? cinematic.setFreeFlight(false) : cinematic.applyPreset(p.id, geometry, buildingId || undefined))}
            >
              {PRESET_ICONS[p.id]}
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>
      {freeFlight && (
        <p className="cine-hint">
          <b>Free flight:</b> W/A/S/D move · Q/E down/up · Shift fast · drag to look · wheel changes speed. Press <kbd>K</kbd> to drop a keyframe.
        </p>
      )}
    </div>
  );
}
