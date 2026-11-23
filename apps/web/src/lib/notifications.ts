import type { NotificationDTO, NotificationType } from "@commune/shared";

export const notificationLabels: Record<NotificationType, string> = {
  follow: "Заявки в друзья",
  like: "Отметки «Нравится»",
  comment: "Комментарии",
  repost: "Репосты",
};

const postNotificationText: Record<NotificationType, string> = {
  follow: "хочет добавить вас в друзья",
  like: "понравилась ваша запись",
  comment: "прокомментировал вашу запись",
  repost: "поделился вашей записью",
};

export function notificationText(notification: NotificationDTO) {
  if (notification.commentId && notification.type === "like") return "понравился ваш комментарий";
  if (notification.commentId && notification.type === "comment" && !notification.postComment) return "ответил на ваш комментарий";
  return postNotificationText[notification.type];
}

export function notificationTarget(notification: NotificationDTO) {
  if (!notification.postId) return `/u/${notification.actor.username}`;
  const comment = notification.commentId;
  return `/posts/${notification.postId}${comment ? `?comment=${comment}#comment-${comment}` : ""}`;
}

export const hideNotificationToasts = "(max-width: 767px), (hover: none) and (pointer: coarse)";
export const notificationVersion = (notification: NotificationDTO) =>
  `${notification.id}/${notification.createdAt}`;
