import { Link } from "react-router-dom";
import { displayNameOf, type NotificationDTO } from "@commune/shared";
import { notificationTarget, notificationText, notificationVersion } from "../lib/notifications";

export default function NotificationToasts({ items, dismiss }: {
  items: NotificationDTO[];
  dismiss: (version: string) => void;
}) {
  return (
    <div className="notification-toasts" data-theme="aero-blue" aria-live="polite" aria-relevant="additions">
      {items.map((item) => {
        const version = notificationVersion(item);
        return (
          <Link key={version} className="notification-toast" to={notificationTarget(item)} onClick={() => dismiss(version)}>
            <strong>{displayNameOf(item.actor)}</strong> {notificationText(item)}
          </Link>
        );
      })}
    </div>
  );
}
