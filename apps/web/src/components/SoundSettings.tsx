import { setSoundPrefs, useSoundPrefs } from "../lib/sound";

/** Turn the notification chimes on or off, set the volume, and listen to them. This device only. */
export default function SoundSettings() {
  const prefs = useSoundPrefs();

  return (
    <section className="card sound-settings" aria-label="Звуки уведомлений">
      <h2 className="push-title">Звуки</h2>
      <label className="sound-volume">
        <span>Громкость</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(prefs.volume * 100)}
          aria-label="Громкость всех уведомлений"
          onChange={(e) => setSoundPrefs({ volume: Number(e.target.value) / 100 })}
        />
        <span className="muted small">{Math.round(prefs.volume * 100)}%</span>
      </label>
    </section>
  );
}
