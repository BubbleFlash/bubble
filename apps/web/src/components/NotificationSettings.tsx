import { notificationTypes } from "@commune/shared";
import { useNotificationPreferences, useSaveNotificationPreference } from "../hooks/useSocial";
import { notificationLabels } from "../lib/notifications";
import PushSettings from "./PushSettings";
import SoundSettings from "./SoundSettings";

export default function NotificationSettings() {
  const preferences = useNotificationPreferences();
  const save = useSaveNotificationPreference();

  return (
    <details className="card notification-settings">
      <summary>Настройки уведомлений</summary>
      <div className="notification-settings-body">
        <p className="muted small">
          Скрытые уведомления сохраняются и снова появятся при включении категории.
        </p>
        {preferences.isLoading && <p className="muted" role="status">Загружаем настройки…</p>}
        {preferences.isError && <p className="error" role="alert">{preferences.error.message}</p>}
        {preferences.data && (
          <table className="notification-preferences">
            <thead><tr><th scope="col">Категория</th><th scope="col">Показывать</th><th scope="col">Звук</th></tr></thead>
            <tbody>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {save.isError && <p className="error" role="alert">{save.error.message}</p>}
        <SoundSettings />
        <PushSettings />
      </div>
    </details>
  );
}
