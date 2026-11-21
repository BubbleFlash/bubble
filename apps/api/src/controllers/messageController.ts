import { accountRestriction } from "../services/restrictions.js";
import type { Request, Response } from "express";
import mongoose from "mongoose";
import type { AvatarFrame, ConversationDTO, MessageDTO, MessagePage, RepostSource, SendMessageInput } from "@commune/shared";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { MessageImage } from "../models/MessageImage.js";
import { randomBytes } from "node:crypto";
import { detectImageType } from "../utils/images.js";
import { createDownloadUrl, uploadObject } from "../services/storageService.js";
import { loadPostMusic, validateMusicTrackIds } from "../services/postMusic.js";
import { presentReposts, validateRepostSource } from "../services/repostService.js";
import { notifyRepost } from "../services/notificationService.js";
import type { PopulatedPost } from "../utils/serializers.js";
import { User } from "../models/User.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import { pushConfigured, pushToUser } from "../services/pushService.js";
import { emitToUsers } from "../services/realtime.js";
import { isPlusActive } from "../utils/plan.js";
import { findByUsername } from "./userController.js";

const PREVIEW_LENGTH = 120;
const USER_FIELDS = "username displayName bio avatarUrl avatarFrame plusUntil banned accountRestriction deletionExpiresAt anonymizedAt";

interface LeanUser {
  _id: unknown;
  username: string;
  displayName?: string | null;
  bio?: string;
  avatarUrl?: string | null;
  avatarFrame?: AvatarFrame | null;
  plusUntil?: Date | null;
}
interface LeanConversation {
  _id: unknown;
  participants: unknown[];
  lastMessageAt: Date;
  unread?: Record<string, number> | null;
}
interface LeanMessage {
  _id: unknown;
  conversation: unknown;
  sender: unknown;
  text: string;
  musicTrackIds?: unknown[];
  clientMessageId?: string;
  imageIds?: unknown[];
  repost?: { post: mongoose.Types.ObjectId; comment?: mongoose.Types.ObjectId };
  createdAt: Date;
  editedAt?: Date;
}

const str = (v: unknown) => String(v);
const pairKey = (a: string, b: string) => [a, b].sort().join(":");
const newestFirst = { createdAt: -1, _id: -1 } as const;

function messageText(message: { text: string; imageIds?: unknown[]; repost?: unknown }) {
  return message.text || (message.repost ? "Репост" : message.imageIds?.length ? "Фото" : "Музыка");
}

function toMessageDTO(m: LeanMessage, musicAttachments: MessageDTO["musicAttachments"] = [], repost?: MessageDTO["repost"]): MessageDTO {
  return {
    id: str(m._id),
    conversationId: str(m.conversation),
    senderId: str(m.sender),
    text: m.text,
    musicAttachments,
    imageIds: (m.imageIds ?? []).map(str),
    ...(m.repost ? { hasRepost: true, repost } : {}),
    ...(m.clientMessageId ? { clientMessageId: m.clientMessageId } : {}),
    createdAt: m.createdAt.toISOString(),
    ...(m.editedAt ? { editedAt: m.editedAt.toISOString() } : {}),
  };
}

function toConversationDTO(c: LeanConversation, me: string, other: LeanUser, last?: Parameters<typeof messageText>[0] & Pick<LeanMessage, "sender" | "createdAt">): ConversationDTO {
  const counts = c.unread && typeof c.unread === "object" ? c.unread : {};
  const unread = Number(counts[me] ?? 0);
  const otherUnread = Number(counts[str(other._id)] ?? 0);
  return {
    id: str(c._id),
    other: {
      id: str(other._id),
      username: other.username,
      displayName: other.displayName ?? undefined,
      bio: other.bio ?? "",
      avatarUrl: other.avatarUrl ?? null,
      avatarFrame: other.avatarFrame ?? undefined,
      plus: isPlusActive(other.plusUntil),
    },
    lastMessage: last
      ? {
          text: messageText(last).slice(0, PREVIEW_LENGTH),
          senderId: str(last.sender),
          createdAt: last.createdAt.toISOString(),
        }
      : null,
    lastMessageAt: (last?.createdAt ?? c.lastMessageAt).toISOString(),
    unread,
    seenByOther:
      Boolean(last && str(last.sender) === me && otherUnread === 0),
  };
}

/** Loads a conversation and makes sure the caller is one of its two participants. */
async function loadConversation(id: string | undefined, me: string) {
  if (!id || !mongoose.isValidObjectId(id)) throw notFound("Conversation not found");
  const convo = (await Conversation.findById(id).lean()) as LeanConversation | null;
  // Same answer for "doesn't exist" and "not yours" so ids can't be probed.
  if (!convo || !convo.participants.some((p) => str(p) === me))
    throw notFound("Conversation not found");
  const otherId = convo.participants.map(str).find((p) => p !== me);
  return { convo, otherId: otherId ?? me };
}

/** Push notification for the recipient when they are not looking at the site. Never throws. */
async function notifyByPush(convoId: string, me: string, otherId: string, text: string) {
  if (!pushConfigured()) return;
  const sender = (await User.findById(me).select("username displayName").lean()) as {
    username?: string;
    displayName?: string;
  } | null;
  await pushToUser(otherId, "message", {
    title: sender?.displayName || sender?.username || "Someone",
    body: text,
    url: `/messages/${convoId}`,
    tag: `msg-${convoId}`,
  });
}

async function saveMessage(convoId: string, me: string, otherId: string, input: SendMessageInput, source?: PopulatedPost) {
  const { text, musicTrackIds = [], clientMessageId, imageIds = [], repost } = input;
  const repostAncestors = source ? [...(source.repostAncestors ?? []), source._id] : undefined;
  const message = await Message.create({ conversation: convoId, sender: me, text, musicTrackIds, clientMessageId, imageIds, repost, repostAncestors });
  const summary = messageText({ text, repost, imageIds });
  await Conversation.updateOne(
    { _id: convoId },
    {
      $max: { lastMessageAt: message.createdAt },
      $inc: { [`unread.${otherId}`]: 1 },
    },
  );
  const row = message.toObject() as unknown as LeanMessage;
  const music = await loadPostMusic([row]);
  // Live events carry no repost preview. Each participant fetches their own accessible version.
  const dto = toMessageDTO(row, music.get(str(row._id)) ?? []);
  // Live delivery to the recipient, and to the sender's other tabs and devices.
  const [, , [repostPreview]] = await Promise.all([
    emitToUsers([me, otherId], "message:new", { message: dto }),
    notifyByPush(convoId, me, otherId, summary),
    presentReposts([row.repost], me),
    source && notifyRepost(source, me),
  ]);
  return { ...dto, ...(repostPreview ? { repost: repostPreview } : {}) };
}

/** GET /messages: your conversations, most recent first. */
export async function listConversations(req: Request, res: Response) {
  const me = req.userId!;
  const convos = await Conversation.aggregate<LeanConversation & { last: LeanMessage[] }>([
    { $match: { participants: new mongoose.Types.ObjectId(me) } },
    { $sort: { lastMessageAt: -1 } },
    { $limit: 50 },
    { $lookup: {
      from: Message.collection.name,
      localField: "_id",
      foreignField: "conversation",
      pipeline: [
        { $sort: newestFirst },
        { $limit: 1 },
        { $project: { text: 1, imageIds: 1, repost: 1, sender: 1, createdAt: 1 } },
      ],
      as: "last",
    } },
  ]);

  const otherIds = convos.map((c) => c.participants.map(str).find((p) => p !== me) ?? me);
  const users = (await User.find({ _id: { $in: otherIds } })
    .select(USER_FIELDS)
    .lean()) as unknown as (LeanUser & Parameters<typeof accountRestriction>[0])[];
  const byId = new Map(users.map((u) => [str(u._id), u]));
  const out: ConversationDTO[] = [];
  convos.forEach((c, i) => {
    const other = byId.get(otherIds[i]!);
      if (other && !accountRestriction(other)) out.push(toConversationDTO(c, me, other, c.last[0]));
  });
  out.sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
  res.json(out);
}

/** GET /messages/unread-count: how many conversations have unread messages. */
export async function unreadCount(req: Request, res: Response) {
  const me = req.userId!;
  const count = await Conversation.countDocuments({
    participants: me,
    [`unread.${me}`]: { $gt: 0 },
  });
  res.json({ count });
}

async function markConversationRead(convo: LeanConversation, me: string, otherId: string) {
  const unread = convo.unread?.[me] ?? 0;
  if (!unread) return;
  const conversationId = str(convo._id);
  const counter = `unread.${me}`;
  const result = await Conversation.updateOne(
    { _id: conversationId, [counter]: unread, lastMessageAt: convo.lastMessageAt },
    { $set: { [counter]: 0 } },
  );
  if (result.modifiedCount) {
    await emitToUsers([otherId, me], "message:read", { conversationId, readerId: me });
  }
}

/** GET /messages/:id: a page of messages (newest page first request; older via cursor). */
export async function getMessages(req: Request, res: Response) {
  const me = req.userId!;
  const { convo, otherId } = await loadConversation(req.params.id, me);
  const { cursor, limit } = res.locals.query as { cursor?: string; limit: number };
  const [timestamp, cursorId] = cursor?.split("~") ?? [];
  const oldest = timestamp ? new Date(timestamp) : undefined;
  const before = cursorId
    ? { $or: [{ createdAt: { $lt: oldest } }, { createdAt: oldest, _id: { $lt: cursorId } }] }
    : oldest ? { createdAt: { $lt: oldest } } : {};

  const rows = (await Message.find({
    conversation: str(convo._id),
    ...before,
  })
    .sort(newestFirst)
    .limit(limit + 1)
    .lean()) as unknown as LeanMessage[];

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit); // newest first
  const last = page.at(-1);
  const nextCursor = hasMore && last ? `${last.createdAt.toISOString()}~${str(last._id)}` : null;

  // Opening the latest page counts as reading the conversation.
  if (!cursor) await markConversationRead(convo, me, otherId);

  const other = (await User.findById(otherId)
    .select(USER_FIELDS)
    .lean()) as unknown as LeanUser | null;
  page.reverse(); // oldest first for display
  const [music, reposts] = await Promise.all([
    loadPostMusic(page),
    presentReposts(page.map((row) => row.repost), me),
  ]);
  const result: MessagePage & { conversation?: ConversationDTO } = {
    items: page.map((row, index) => toMessageDTO(row, music.get(str(row._id)) ?? [], reposts[index])),
    nextCursor,
  };
  if (!cursor && other) result.conversation = toConversationDTO(convo, me, other, page.at(-1));
  res.json(result);
}

async function ownMessage(req: Request) {
  const me = req.userId!;
  const { convo, otherId } = await loadConversation(req.params.id, me);
  const id = req.params.messageId;
  if (!mongoose.isObjectIdOrHexString(id)) throw notFound("Message not found");
  const filter = { _id: id, conversation: convo._id, sender: me };
  const message = await Message.findOne(filter).lean();
  if (!message) throw notFound("Message not found");
  return { convo, otherId, filter, message };
}

async function clearLegacyPreview(convo: LeanConversation, message: Pick<LeanMessage, "createdAt" | "sender">) {
  await Conversation.updateOne(
    { _id: convo._id, lastMessageAt: message.createdAt, lastMessageSender: message.sender },
    { $unset: { lastMessageText: "", lastMessageSender: "" } },
  );
}

export async function editMessage(req: Request, res: Response) {
  const { convo, otherId, filter, message } = await ownMessage(req);
  const { text } = req.body as { text: string };
  if (!text && !message.imageIds?.length && !message.musicTrackIds?.length && !message.repost) {
    throw badRequest("Write a message or attach a file");
  }
  if (text !== message.text) {
    const result = await Message.updateOne(filter, { $set: { text, editedAt: new Date() } });
    if (!result.matchedCount) throw notFound("Message not found");
    await clearLegacyPreview(convo, message);
    await emitToUsers([req.userId!, otherId], "message:changed", { conversationId: str(convo._id) });
  }
  res.status(204).end();
}

export async function deleteMessage(req: Request, res: Response) {
  const { convo, otherId, filter, message } = await ownMessage(req);
  const deleted = await Message.deleteOne(filter);
  if (deleted.deletedCount) {
    const counter = `unread.${otherId}`;
    const unread = convo.unread?.[otherId] ?? 0;
    const newerFromSender = unread ? await Message.countDocuments({
      conversation: convo._id,
      sender: req.userId!,
      $or: [{ createdAt: { $gt: message.createdAt } }, { createdAt: message.createdAt, _id: { $gt: message._id } }],
    }) : 0;
    await Promise.all([
      clearLegacyPreview(convo, message),
      unread > newerFromSender && Conversation.updateOne(
        { _id: convo._id, [counter]: unread, lastMessageAt: convo.lastMessageAt },
        { $inc: { [counter]: -1 } },
      ),
    ]);
    await emitToUsers([req.userId!, otherId], "message:changed", { conversationId: str(convo._id) });
  }
  res.status(204).end();
}

/** POST /messages/:id: reply in an existing conversation. */
export async function send(req: Request, res: Response) {
  const me = req.userId!;
  const { convo, otherId } = await loadConversation(req.params.id, me);
  const other = await User.findById(otherId).select("banned accountRestriction deletionExpiresAt anonymizedAt").lean();
  if (!other || other.deletionExpiresAt || other.anonymizedAt || accountRestriction(other)) throw forbidden("You can't message this account");
  const input = req.body as SendMessageInput;
  const source = await validateMessageAttachments(me, input);
  res.status(201).json(await saveMessage(str(convo._id), me, otherId, input, source));
}

/** POST /messages/with/:username: send to a person, creating the conversation if needed. */
export async function start(req: Request, res: Response) {
  const me = req.userId!;
  const target = await findByUsername(req.params.username);
  const targetId = str(target._id);
  if (targetId === me) throw badRequest("You can't message yourself");
  if (accountRestriction(target)) throw forbidden("You can't message this account");

  const input = req.body as SendMessageInput;
  const source = await validateMessageAttachments(me, input);
  const key = pairKey(me, targetId);
  const convo = (await Conversation.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, participants: [me, targetId], lastMessageAt: new Date() } },
    { upsert: true, new: true },
  ).lean()) as unknown as LeanConversation;

  const message = await saveMessage(str(convo._id), me, targetId, input, source);
  res.status(201).json({ conversationId: str(convo._id), message });
}

async function validateMessageAttachments(userId: string, { musicTrackIds = [], imageIds = [], repost }: {
  musicTrackIds?: string[];
  imageIds?: string[];
  repost?: RepostSource;
}) {
  const [, , source] = await Promise.all([
    validateMusicTrackIds(musicTrackIds),
    validateImages(userId, imageIds),
    repost ? validateRepostSource(repost, userId) : undefined,
  ]);
  return source;
}

async function validateImages(userId: string, ids: string[]) {
  if (ids.length && await MessageImage.countDocuments({ _id: { $in: ids }, owner: userId }) !== ids.length) throw badRequest("Invalid message images");
}

export async function uploadImage(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw badRequest("No file uploaded");
  const ext = detectImageType(file.buffer);
  if (!ext) throw badRequest("Only PNG, JPEG, GIF and WebP images are allowed");
  const types: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  const storageKey = `message-images/${randomBytes(16).toString("hex")}.${ext}`;
  await uploadObject(storageKey, file.buffer, types[ext]!);
  const image = await MessageImage.create({ owner: req.userId!, storageKey });
  res.status(201).json({ url: image.id });
}

export async function imageUrl(req: Request, res: Response) {
  const id = req.params.imageId;
  if (!id || !mongoose.isValidObjectId(id)) throw notFound("Image not found");
  const image = await MessageImage.findById(id).lean();
  if (!image) throw notFound("Image not found");
  if (str(image.owner) !== req.userId) {
    const messages = await Message.find({ imageIds: image._id }).select("conversation").lean();
    const accessible = await Conversation.exists({ _id: { $in: messages.map((item) => item.conversation) }, participants: req.userId });
    if (!accessible) throw notFound("Image not found");
  }
  res.set("Cache-Control", "private, no-store");
  res.json({ url: await createDownloadUrl(image.storageKey, 120) });
}

/** POST /messages/:id/read: the person is looking at the conversation, so mark it read. */
export async function markRead(req: Request, res: Response) {
  const me = req.userId!;
  const { convo, otherId } = await loadConversation(req.params.id, me);
  await markConversationRead(convo, me, otherId);
  res.status(204).end();
}
