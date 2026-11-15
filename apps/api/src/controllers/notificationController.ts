import type { Request, Response } from "express";
import {
  notificationTypes,
  type NotificationDTO,
  type NotificationPreference,
  type NotificationPreferences,
  type NotificationQuery,
  type NotificationType,
  type Page,
  type ReadNotificationsInput,
} from "@commune/shared";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { getNotificationPreferences } from "../services/notificationService.js";
import { toNotificationDTO, type PopulatedNotification } from "../utils/serializers.js";

function visibleTypes(prefs: NotificationPreferences, selected?: NotificationType) {
  return notificationTypes.filter((type) => prefs[type].visible && (!selected || selected === type));
}

export async function list(req: Request, res: Response) {
  const { type, limit, cursor } = res.locals.query as NotificationQuery;
  const prefs = await getNotificationPreferences(req.userId!);
  const pageSize = limit ?? 30;
  const paginated = limit !== undefined || cursor !== undefined;
  const boundary = cursor && new Date(cursor[0]);
  const rows = (await Notification.find({
    user: req.userId,
    type: { $in: visibleTypes(prefs, type) },
    ...(boundary && cursor && {
      $or: [{ createdAt: { $lt: boundary } }, { createdAt: boundary, _id: { $lt: cursor[1] } }],
    }),
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(paginated ? pageSize + 1 : pageSize)
    .populate("actor", "username displayName")
    .lean()) as unknown as PopulatedNotification[];
  const selected = rows.slice(0, pageSize);
  const items = selected.filter((row) => row.actor).map(toNotificationDTO);
  if (!paginated) {
    res.json(items);
    return;
  }
  const last = selected.at(-1);
  res.json({
    items,
    // Advance even if an actor was deleted and that row is missing from the response.
    nextCursor: rows.length > pageSize && last ? `${last.createdAt.toISOString()}|${last._id}` : null,
  } satisfies Page<NotificationDTO>);
}

export async function unreadCount(req: Request, res: Response) {
  const prefs = await getNotificationPreferences(req.userId!);
  const count = await Notification.countDocuments({
    user: req.userId,
    read: false,
    type: { $in: visibleTypes(prefs) },
  });
  res.json({ count });
}

export async function markAllRead(req: Request, res: Response) {
  const { type, through, items } = (req.body ?? {}) as ReadNotificationsInput;
  const prefs = await getNotificationPreferences(req.userId!);
  await Notification.updateMany({
    user: req.userId,
    read: false,
    type: { $in: visibleTypes(prefs, type) },
    // Preserve events that arrived after the client fetched this list.
    ...(through && { createdAt: { $lte: new Date(through) } }),
    // Likes and follows can reuse an ID when they become unread again.
    ...(items && { $or: items.map(({ id, createdAt }) => ({ _id: id, createdAt: new Date(createdAt) })) }),
  }, { $set: { read: true } });
  res.status(204).end();
}

export async function preferences(req: Request, res: Response) {
  res.json(await getNotificationPreferences(req.userId!));
}

export async function savePreference(req: Request, res: Response) {
  const { type, visible, sound } = req.body as NotificationPreference;
  await User.updateOne(
    { _id: req.userId },
    { $set: { [`notificationPreferences.${type}`]: { visible, sound } } },
  );
  res.json(await getNotificationPreferences(req.userId!));
}
