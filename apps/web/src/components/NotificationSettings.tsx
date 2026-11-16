import { notificationTypes } from "@commune/shared";
import { useNotificationPreferences, useSaveNotificationPreference } from "../hooks/useSocial";
import { notificationLabels } from "../lib/notifications";
import PushSettings from "./PushSettings";
import SoundSettings from "./SoundSettings";
import { playSound, setSoundPrefs, unlockAudio, useSoundPrefs } from "../lib/sound";

export default function NotificationSettings() {
  const preferences = useNotificationPreferences();
  const save = useSaveNotificationPreference();
  const soundPrefs = useSoundPrefs();

  return (
    <>
      <section className="card notification-settings" aria-labelledby="notification-settings-title">
        <h2 id="notification-settings-title" className="push-title">Категории уведомлений</h2>
        <p className="muted small">
          Скрытые уведомления сохраняются и снова появятся при включении категории.
        </p>
        {preferences.isLoading && <p className="muted" role="status">Загружаем настройки…</p>}
        {preferences.isError && <p className="error" role="alert">{preferences.error.message}</p>}
        {preferences.data && (
          <table className="notification-preferences">
            <thead><tr><th scope="col">Категория</th><th scope="col">Показывать</th><th scope="col">Звук</th><th scope="col">Прослушать</th></tr></thead>
            <tbody>
              <tr>
                <th scope="row">Сообщения</th>
                <td><span title="Сообщения всегда доступны в переписках" aria-label="Сообщения всегда доступны в переписках">—</span></td>
                <td><input type="checkbox" aria-label="Звук: Сообщения" checked={soundPrefs.messageEnabled} onChange={(event) => setSoundPrefs({ messageEnabled: event.target.checked })} /></td>
                <td><button type="button" className="btn btn-ghost notification-preview" aria-label="Прослушать: Сообщения" title="Прослушать: Сообщения" onClick={() => { unlockAudio(); playSound("message", { force: true }); }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" /></svg>
                </button></td>
              </tr>
              {notificationTypes.map((type) => {
                const { visible, sound } = preferences.data[type];
                const pending = save.isPending ? save.variables : undefined;
                const value = pending?.type === type ? pending : { visible, sound };
                const label = notificationLabels[type];
                return (
                  <tr key={type}>
                    <th scope="row">{label}</th>
                    <td><input
                      type="checkbox"
                      aria-label={`Показывать: ${label}`}
                      checked={value.visible}
                      disabled={save.isPending}
                      onChange={(event) => save.mutate({ type, visible: event.target.checked, sound })}
                    /></td>
                    <td><input
                      type="checkbox"
                      aria-label={`Звук: ${label}`}
                      checked={value.sound}
                      disabled={save.isPending || !value.visible}
                      onChange={(event) => save.mutate({ type, visible, sound: event.target.checked })}
                    /></td>
                    <td><button type="button" className="btn btn-ghost notification-preview" aria-label={`Прослушать: ${label}`} title={`Прослушать: ${label}`} onClick={() => { unlockAudio(); playSound(type, { force: true }); }}>
                      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" /></svg>
                    </button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {save.isError && <p className="error" role="alert">{save.error.message}</p>}
      </section>
      <SoundSettings />
      <PushSettings />
    </>
  );
}
