import { useId, useLayoutEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { displayNameOf, notificationTypes, type NotificationDTO, type NotificationType } from "@commune/shared";
import { useNotificationPreferences, useNotifications } from "../hooks/useSocial";
import { useLoadMoreOnVisible } from "../hooks/useInfiniteScroll";
import { notificationLabels, notificationTarget, notificationText } from "../lib/notifications";
import { timeAgo } from "./PostCard";
import { RowsSkeleton } from "./Skeleton";
import Avatar from "./Avatar";
import Icon from "./Icon";

const typeIcons = { follow: "users", like: "heart", comment: "comment", repost: "repost" } as const;

export default function NotificationList({ compact, onItems, onSelect, filterAction }: {
  compact?: boolean;
  onItems: (items: NotificationDTO[]) => void;
  onSelect?: (item: NotificationDTO, event: MouseEvent<HTMLAnchorElement>) => void;
  filterAction?: ReactNode;
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
        {filterAction}
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
          <div
            key={item.id}
            className={`card notification${item.read ? "" : " unread"}`}
            aria-description={item.read ? "Прочитано" : "Не прочитано"}
          >
            <Link className="notification-target" to={notificationTarget(item)} aria-label={`${displayNameOf(item.actor)} ${notificationText(item)}`} onClick={(event) => onSelect?.(item, event)} />
            <span className="row">
              <span className="notification-avatar"><Avatar username={item.actor.username} displayName={item.actor.displayName} url={item.actor.avatarUrl} frame={item.actor.avatarFrame} size={24} trackOnline /><span className={`notification-type notification-type--${item.type}`} title={notificationLabels[item.type]}><Icon name={typeIcons[item.type]} size={12} /></span></span>
              <span><Link className="notification-actor" to={`/u/${encodeURIComponent(item.actor.username)}`} onClick={(event) => onSelect?.(item, event)}><strong>{displayNameOf(item.actor)}</strong></Link> {notificationText(item)}</span>
            </span>
            <time className="muted small" dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
          </div>
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
