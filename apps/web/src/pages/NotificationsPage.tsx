import type { NotificationDTO } from "@commune/shared";
import NotificationList from "../components/NotificationList";
import { useReadNotifications } from "../hooks/useSocial";

export default function NotificationsPage({ onItems }: { onItems: (items: NotificationDTO[]) => void }) {
  const { mutate: markRead } = useReadNotifications();

  return (
    <>
      <h1 className="page-title">Уведомления</h1>
      <NotificationList openInNewTab onItems={onItems} onSelect={({ id, createdAt, read }) => {
        if (!read) markRead([{ id, createdAt }]);
      }} />
    </>
  );
}
