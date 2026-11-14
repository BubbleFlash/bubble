import type { Types } from "mongoose";
import {
  type NotificationNewEvent,
  type NotificationPreferences,
  type NotificationType,
} from "@commune/shared";
import { logger } from "../config/logger.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { toNotificationDTO } from "../utils/serializers.js";
import { pushConfigured, pushToUser } from "./pushService.js";
import { emitToUsers } from "./realtime.js";

interface NotifyInput {
  /** Recipient. */
  user: Types.ObjectId | string;
  /** The user who did the thing (id as string). */
  actor: string;
  type: NotificationType;
  post?: Types.ObjectId | string;
}

export async function getNotificationPreferences(userId: Types.ObjectId | string) {
  const user = await User.findById(userId).select("notificationPreferences").lean();
  const preferenceFor = (type: NotificationType) => {
    const preference = user?.notificationPreferences?.[type];
    return { visible: preference?.visible !== false, sound: preference?.sound !== false };
  };
  return {
    follow: preferenceFor("follow"),
    like: preferenceFor("like"),
    comment: preferenceFor("comment"),
  } satisfies NotificationPreferences;
}

/**
 * Creates a notification. Never throws: a failed notification must not break the
 * action (like, comment, follow) that triggered it.
 *
 * Likes and follows are upserted so repeated like/unlike or follow/unfollow does not
 * spam the recipient; each comment creates its own notification.
 */
export async function notify({ user, actor, type, post }: NotifyInput): Promise<void> {
  if (user.toString() === actor) return;
  try {
    const key = { user, actor, type, post: post ?? null };
    const saved = type === "comment"
      ? await Notification.create({ ...key, read: false })
      : await Notification.findOneAndUpdate(
        key,
        { $set: { read: false, createdAt: new Date() } },
        { upsert: true, new: true },
      );
    const prefs = await getNotificationPreferences(user);
    if (!prefs[type].visible) {
      // A hidden request can still change the recipient's relationships.
      await emitToUsers([user], "notification:new");
      return;
    }
    const actorUser = await User.findById(actor).select("username").lean();
    const event: NotificationNewEvent = saved && actorUser
      ? {
          notification: toNotificationDTO({ ...saved.toObject(), post: saved.post ?? null, actor: actorUser }),
          sound: prefs[type].sound,
        }
      : {};
    await emitToUsers([user], "notification:new", event);
    if (pushConfigured()) {
      const name = `@${actorUser?.username ?? "Someone"}`;
      const text = {
        like: "liked your post",
        comment: "commented on your post",
        follow: "wants to add you as a friend",
      }[type];
      await pushToUser(user.toString(), "social", {
        title: "Commune",
        body: `${name} ${text}`,
        url: post ? `/posts/${post.toString()}` : `/u/${actorUser?.username ?? ""}`,
        tag: `social-${type}-${post?.toString() ?? actor}`,
      }, type);
    }
  } catch (err) {
    logger.warn({ err }, "Failed to create notification");
  }
}
