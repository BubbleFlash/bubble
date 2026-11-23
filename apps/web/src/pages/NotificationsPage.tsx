import type { NotificationDTO } from "@commune/shared";
import NotificationList from "../components/NotificationList";
import { useReadAllNotifications, useReadNotifications } from "../hooks/useSocial";

export default function NotificationsPage({ onItems, onNavigateToItem }: { onItems: (items: NotificationDTO[]) => void; onNavigateToItem: () => void }) {
  const { mutate: markRead } = useReadNotifications();
  const markAll = useReadAllNotifications();

  return (
    <>
      <h1 className="page-title">Уведомления</h1>
      {markAll.isError && <p className="error" role="alert">{markAll.error.message}</p>}
      <NotificationList onItems={onItems} filterAction={<button type="button" className="btn notification-filter__action" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
        {markAll.isPending ? "Отмечаем…" : "Прочитать все"}
      </button>} onSelect={({ id, createdAt, read }, event) => {
        if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          onNavigateToItem();
          if (!read) markRead([{ id, createdAt }]);
        }
      }} />
    </>
  );
}
