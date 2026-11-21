import type { NotificationDTO } from "@commune/shared";
import NotificationList from "../components/NotificationList";
import { useReadNotifications } from "../hooks/useSocial";

export default function NotificationsPage({ onItems, onNavigateToItem }: { onItems: (items: NotificationDTO[]) => void; onNavigateToItem: () => void }) {
  const { mutate: markRead } = useReadNotifications();

  return (
    <>
      <h1 className="page-title">Уведомления</h1>
      <NotificationList onItems={onItems} onSelect={({ id, createdAt, read }, event) => {
        if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          onNavigateToItem();
          if (!read) markRead([{ id, createdAt }]);
        }
      }} />
    </>
  );
}
