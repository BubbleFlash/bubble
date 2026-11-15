import type { NotificationDTO, NotificationType } from "@commune/shared";

export const notificationLabels: Record<NotificationType, string> = {
  follow: "Заявки в друзья",
  like: "Отметки «Нравится»",
  comment: "Комментарии",
  repost: "Репосты",
};

export const notificationText: Record<NotificationType, string> = {
  follow: "хочет добавить вас в друзья",
  like: "понравилась ваша запись",
  comment: "прокомментировал вашу запись",
  repost: "поделился вашей записью",
};

export function notificationTarget(notification: NotificationDTO) {
  return notification.postId
    ? `/posts/${notification.postId}`
    : `/u/${notification.actor.username}`;
}

export const hideNotificationToasts = "(max-width: 767px), (hover: none) and (pointer: coarse)";
export const notificationVersion = (notification: NotificationDTO) =>
  `${notification.id}/${notification.createdAt}`;
