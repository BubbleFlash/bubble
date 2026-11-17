import { useId, useLayoutEffect, useMemo, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { displayNameOf, notificationTypes, type NotificationDTO, type NotificationType } from "@commune/shared";
import { useNotificationPreferences, useNotifications } from "../hooks/useSocial";
import { useLoadMoreOnVisible } from "../hooks/useInfiniteScroll";
import { notificationLabels, notificationTarget, notificationText } from "../lib/notifications";
import { timeAgo } from "./PostCard";
import { RowsSkeleton } from "./Skeleton";

export default function NotificationList({ compact, openInNewTab, onItems, onSelect }: {
  compact?: boolean;
  openInNewTab?: boolean;
  onItems: (items: NotificationDTO[]) => void;
  onSelect?: (item: NotificationDTO, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const filterId = useId();
  const [type, setType] = useState<NotificationType>();
  const list = useNotifications(type, compact);
  const { data: preferences } = useNotificationPreferences();
  const items = useMemo(() => {
    const byId = new Map<string, NotificationDTO>();
    for (const page of list.data?.pages ?? []) {
      for (const item of page.items) {
        if (!byId.has(item.id)) byId.set(item.id, item);
      }
    }
    return Array.from(byId.values());
  }, [list.data]);
  const loadMore = () => void list.fetchNextPage({ cancelRefetch: false });
  const sentinel = useLoadMoreOnVisible(loadMore, list.hasNextPage && !list.isFetching && !list.isError);

  useLayoutEffect(() => {
    onItems(items);
  }, [items, onItems]);

  return (
    <>
      <div className="notification-filter">
        <label htmlFor={filterId}>Категория</label>
        <select id={filterId} value={type ?? ""} onChange={(event) => {
          setType(notificationTypes.find((value) => value === event.target.value));
        }}>
          <option value="">Все уведомления</option>
          {notificationTypes.map((value) => (
            <option key={value} value={value}>{notificationLabels[value]}</option>
          ))}
        </select>
      </div>
      <div className={compact ? "notification-list notification-list-compact" : "notification-list"}>
        {list.isLoading && <RowsSkeleton count={compact ? 3 : 5} avatar={36} card />}
        {list.isError && <p className="error center">{list.error.message}</p>}
        {list.isSuccess && !list.hasNextPage && items.length === 0 && (
          <p className="muted center">
            {type && preferences?.[type].visible === false
              ? "Категория скрыта в настройках."
              : "Уведомлений пока нет."}
          </p>
        )}
        {items.map((item) => (
          <Link
            key={item.id}
            to={notificationTarget(item)}
            target={openInNewTab ? "_blank" : undefined}
            rel={openInNewTab ? "noopener noreferrer" : undefined}
            className={`card notification${item.read ? "" : " unread"}`}
            aria-description={`${item.read ? "Прочитано" : "Не прочитано"}${openInNewTab ? ". Откроется в новой вкладке." : ""}`}
            onClick={(event) => onSelect?.(item, event)}
          >
            <span><strong>{displayNameOf(item.actor)}</strong> {notificationText[item.type]}</span>
            <time className="muted small" dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
          </Link>
        ))}
        {list.isFetchingNextPage && <RowsSkeleton count={3} avatar={36} card />}
        {list.hasNextPage && <div ref={sentinel} aria-hidden="true" />}
        {list.hasNextPage && !list.isFetchingNextPage && (
          <button type="button" className="btn btn-ghost block" disabled={list.isFetching} onClick={loadMore}>
            Загрузить ещё
          </button>
        )}
      </div>
    </>
  );
}
