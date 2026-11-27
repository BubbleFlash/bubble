type Props = {
  title: string;
  titleId: string;
  closeLabel: string;
  closeDisabled?: boolean;
  onClose: () => void;
};

export default function AeroDialogTitlebar({ title, titleId, closeLabel, closeDisabled, onClose }: Props) {
  return (
    <header className="aero-dialog-frame__titlebar">
      <h2 id={titleId}>{title}</h2>
      <span className="aero-window-controls aero-dialog-frame__controls">
        <span className="aero-window-control aero-window-close">
          <button type="button" onClick={onClose} disabled={closeDisabled} aria-label={closeLabel} title="Закрыть">
            <i className="aero-control-close" aria-hidden="true" />
          </button>
        </span>
      </span>
    </header>
  );
}
