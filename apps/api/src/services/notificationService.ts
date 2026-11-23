import type { Types } from "mongoose";
import {
  type NotificationNewEvent,
  type NotificationPreferences,
  type NotificationType,
} from "@commune/shared";
import { logger } from "../config/logger.js";
import { Notification } from "../models/Notification.js";
import { Post } from "../models/Post.js";
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
  comment?: Types.ObjectId | string;
  postComment?: boolean;
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
    repost: preferenceFor("repost"),
  } satisfies NotificationPreferences;
}

/**
 * Creates a notification. Never throws: a failed notification must not break the
 * action (like, comment, follow) that triggered it.
 *
 * Likes and follows are upserted so repeated like/unlike or follow/unfollow does not
 * spam the recipient; each comment and repost creates its own notification.
 */
export async function notify({ user, actor, type, post, comment, postComment }: NotifyInput): Promise<void> {
  if (user.toString() === actor) return;
  try {
    const key = { user, actor, type, post: post ?? null, comment: comment ?? null };
    const saved = type === "comment" || type === "repost"
      ? await Notification.create({ ...key, postComment: Boolean(postComment), read: false })
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
    const actorUser = await User.findById(actor).select("username displayName avatarUrl avatarFrame").lean();
    const event: NotificationNewEvent = saved && actorUser
      ? {
          notification: toNotificationDTO({ ...saved.toObject(), post: saved.post ?? null, actor: actorUser }),
          sound: prefs[type].sound,
        }
      : {};
    await emitToUsers([user], "notification:new", event);
    if (pushConfigured()) {
      const name = actorUser?.displayName || actorUser?.username || "Someone";
      const text = {
        like: comment ? "liked your comment" : "liked your post",
        comment: comment && !postComment ? "replied to your comment" : "commented on your post",
        repost: "shared your post",
        follow: "wants to add you as a friend",
      }[type];
      await pushToUser(user.toString(), "social", {
        title: "Commune",
        body: `${name} ${text}`,
        url: post ? `/posts/${post}${comment ? `?comment=${comment}#comment-${comment}` : ""}` : `/u/${actorUser?.username ?? ""}`,
        tag: `social-${type}-${comment ?? post ?? actor}`,
      }, type);
    }
  } catch (err) {
    logger.warn({ err }, "Failed to create notification");
  }
}

/** For a private message, link back to the original without revealing the conversation. */
export async function notifyRepost(
  source: { _id: Types.ObjectId; author: { _id: Types.ObjectId }; repostAncestors?: Types.ObjectId[] },
  actor: string,
  publishedPost?: Types.ObjectId,
) {
  try {
    const rootId = source.repostAncestors?.[0];
    const original = rootId
      ? await Post.findById(rootId).select("_id author").lean()
      : { _id: source._id, author: source.author._id };
    if (original) {
      await notify({ user: original.author, actor, type: "repost", post: publishedPost ?? original._id });
    }
  } catch (err) {
    logger.warn({ err }, "Failed to resolve the original author for a repost notification");
  }
}
