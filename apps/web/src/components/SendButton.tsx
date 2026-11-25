export default function SendButton({ disabled, pending }: { disabled: boolean; pending?: boolean }) {
  return (
    <button type="submit" className="btn aero-send-button" aria-label={pending ? "Отправка…" : "Отправить"} title="Отправить" disabled={disabled}>
      {/* Google Material Icons: send, Apache-2.0. */}
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" /></svg>
    </button>
  );
}
