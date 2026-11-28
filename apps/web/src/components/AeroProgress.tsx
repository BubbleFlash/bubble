export default function AeroProgress({ label, value, max = 100, valueText }: {
  label: string;
  value: number;
  max?: number;
  valueText?: string;
}) {
  const displayedValue = Math.min(max, Math.max(0, value));
  return <div
    className="aero-progress"
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={displayedValue}
    aria-valuetext={valueText}
  >
    <span className="aero-progress__fill" style={{ width: `${displayedValue / max * 100}%` }} />
  </div>;
}
