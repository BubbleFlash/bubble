import { accountRestriction } from "../services/restrictions.js";
import type { Types } from "mongoose";
import { isPlusActive } from "./plan.js";
import type {
  AccountUser,
  FriendsVisibility,
  AvatarFrame,
  SiteAppearance,
  CommentDTO,
  CommunityDTO,
  CommunityRole,
  NotificationDTO,
  NotificationType,
  PostDTO,
  ProfileDTO,
  PublicUser,
  ReportDTO,
  ReportReason,
  ReportStatus,
} from "@commune/shared";
import { communityPermissions, meetsCommunityRole, type CommunityAccess } from "../services/communityAccess.js";

interface UserLike {
  _id: Types.ObjectId;
  username: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  avatarFrame?: AvatarFrame | null;
  role?: string | null;
  sessionVersion?: number | null;
  banned?: boolean | null;
  accountRestriction?: { reason?: string | null; until?: Date | null } | null;
  emailVerified?: boolean | null;
  email?: string;
  plusUntil?: Date | null;
  createdAt: Date;
}

export interface PopulatedAuthor {
  _id: Types.ObjectId;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  avatarFrame?: AvatarFrame | null;
  plusUntil?: Date | null;
  deletionExpiresAt?: Date | null;
  anonymizedAt?: Date | null;
}

export interface PopulatedPost {
  moderationState?: string | null;
  _id: Types.ObjectId;
  content: string;
  hideAuthor?: boolean;
  adult?: boolean;
  imageUrl?: string | null;
  imageUrls?: string[];
  musicTrackIds?: Types.ObjectId[];
  priceCents?: number | null;
  community?: (CommunityAccess & { slug: string; name: string; avatarUrl?: string | null }) | null;
  visibility?: PostDTO["visibility"];
  repost?: { post: Types.ObjectId; comment?: Types.ObjectId };
  repostAncestors?: Types.ObjectId[];
  updatedAt?: Date;
  author: PopulatedAuthor;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
}

export interface PopulatedComment {
  _id: Types.ObjectId;
  post: Types.ObjectId;
  parent?: Types.ObjectId;
  mention?: { name?: string | null; username?: string | null } | null;
  content: string;
  imageUrls?: string[];
  musicTrackIds?: Types.ObjectId[];
  author: PopulatedAuthor;
  createdAt: Date;
}

export interface PopulatedNotification {
  _id: Types.ObjectId;
  type: NotificationType;
  actor: { _id: Types.ObjectId; username: string; displayName?: string | null; avatarUrl?: string | null; avatarFrame?: PopulatedAuthor["avatarFrame"] };
  post: Types.ObjectId | null;
  comment?: Types.ObjectId | null;
  postComment?: boolean;
  read: boolean;
  createdAt: Date;
}

export interface PopulatedReport {
  _id: Types.ObjectId;
  reason: ReportReason;
  details?: string | null;
  status: ReportStatus;
  reporter: { _id: Types.ObjectId; username: string; displayName?: string | null };
  post: {
    _id: Types.ObjectId;
    content: string;
    imageUrl?: string | null;
    author: PopulatedAuthor;
  } | null;
  createdAt: Date;
  resolvedAt?: Date | null;
}

export const toAuthor = (a: PopulatedAuthor) => a.deletionExpiresAt || a.anonymizedAt ? ({
  id: a._id.toString(),
  username: `deleted-${a._id}`,
  displayName: "Пользователь недоступен",
  avatarUrl: null,
  avatarFrame: undefined,
  plus: false,
}) : ({
  id: a._id.toString(),
  username: a.username,
  displayName: a.displayName ?? undefined,
  avatarUrl: a.avatarUrl ?? null,
  avatarFrame: a.avatarFrame ?? undefined,
  plus: isPlusActive(a.plusUntil),
});

export function toPublicUser(u: UserLike): PublicUser {
  return {
    id: u._id.toString(),
    username: u.username,
    displayName: u.displayName ?? undefined,
    bio: u.bio ?? "",
    avatarUrl: u.avatarUrl ?? null,
    avatarFrame: u.avatarFrame ?? undefined,
    role: u.role === "admin" || u.role === "moderator" ? u.role : "user",
    plus: isPlusActive(u.plusUntil),
    emailVerified: Boolean(u.emailVerified),
    createdAt: u.createdAt.toISOString(),
  };
}

type UserWithAppearance = UserLike & {
  appearance?: (Omit<Partial<SiteAppearance>, "windowOpacity"> & { windowOpacity?: number | null }) | null;
  shareProfileAppearance?: boolean | null;
  profileAppearanceVisibility?: FriendsVisibility | null;
};

function profileAppearanceVisibility(u: UserWithAppearance): FriendsVisibility {
  return u.profileAppearanceVisibility ?? (u.shareProfileAppearance === false ? "only_me" : "everyone");
}

export function toAccountUser(u: UserWithAppearance): AccountUser {
  const { backgroundUrl, primaryColor, accentColor, font, windowOpacity } = u.appearance ?? {};
  return {
    ...toPublicUser(u),
    email: u.email,
    profileAppearanceVisibility: profileAppearanceVisibility(u),
    appearance: backgroundUrl !== undefined || primaryColor !== undefined || accentColor !== undefined || font !== undefined || windowOpacity != null
      ? { backgroundUrl, primaryColor, accentColor, font, windowOpacity: windowOpacity ?? undefined }
      : undefined,
  };
}

export function toProfileDTO(
  u: UserWithAppearance,
  counts: { followerCount: number; followingCount: number },
  followedByMe: boolean,
  followsMe: boolean,
): ProfileDTO {
  const { backgroundUrl, primaryColor, accentColor, font } = u.appearance ?? {};
  const visibility = profileAppearanceVisibility(u);
  const blocked = Boolean(accountRestriction(u));
  const shareAppearance = !blocked &&
    (visibility === "everyone" || (visibility === "friends" && followedByMe && followsMe));
  const profileAppearance = shareAppearance &&
    (backgroundUrl || primaryColor || accentColor || font)
    ? { backgroundUrl, primaryColor, accentColor, font }
    : undefined;
  const publicUser = toPublicUser(u);
  if (!shareAppearance) delete publicUser.avatarFrame;
  return { ...publicUser, ...counts, followedByMe, followsMe, banned: blocked, profileAppearance };
}

export function toPostDTO(p: PopulatedPost, likedByMe: boolean, musicAttachments: PostDTO["musicAttachments"] = [], online = false): PostDTO {
  return {
    id: p._id.toString(),
    content: p.content,
    hideAuthor: Boolean(p.hideAuthor && p.community),
    adult: Boolean(p.adult),
    imageUrl: p.imageUrl ?? null,
    imageUrls: p.imageUrls?.length ? p.imageUrls : p.imageUrl ? [p.imageUrl] : [],
    musicAttachments,
    author: { ...toAuthor(p.author), online },
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    likedByMe,
    visibility: p.visibility ?? "public",
    community: p.community ? { slug: p.community.slug, name: p.community.name, avatarUrl: p.community.avatarUrl ?? null, creatorId: p.community.creator?.toString() } : null,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toCommentDTO(c: PopulatedComment, likeCount = 0, likedByMe = false, replyCount = 0): CommentDTO {
  return {
    id: c._id.toString(),
    postId: c.post.toString(),
    parentId: c.parent?.toString() ?? null,
    ...(c.mention?.name && c.mention.username ? { mention: { name: c.mention.name, username: c.mention.username } } : {}),
    likeCount,
    likedByMe,
    replyCount,
    content: c.content,
    imageUrls: c.imageUrls ?? [],
    author: toAuthor(c.author),
    createdAt: c.createdAt.toISOString(),
  };
}

export function toNotificationDTO(n: PopulatedNotification): NotificationDTO {
  return {
    id: n._id.toString(),
    type: n.type,
    actor: { id: n.actor._id.toString(), username: n.actor.username, displayName: n.actor.displayName ?? undefined, avatarUrl: n.actor.avatarUrl ?? null, avatarFrame: n.actor.avatarFrame ?? undefined },
    postId: n.post ? n.post.toString() : null,
    ...(n.comment ? { commentId: n.comment.toString() } : {}),
    ...(n.postComment ? { postComment: true } : {}),
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

export function toReportDTO(r: PopulatedReport): ReportDTO {
  return {
    id: r._id.toString(),
    reason: r.reason,
    details: r.details ?? "",
    status: r.status,
    reporter: { id: r.reporter._id.toString(), username: r.reporter.username, displayName: r.reporter.displayName ?? undefined },
    post: r.post
      ? {
          id: r.post._id.toString(),
          content: r.post.content,
          imageUrl: r.post.imageUrl ?? null,
          author: toAuthor(r.post.author),
        }
      : null,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  };
}

export interface CommunityLike extends CommunityAccess {
  slug: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  memberCount: number;
  createdAt: Date;
}

export function toCommunityDTO(c: CommunityLike, myRole: CommunityRole | null): CommunityDTO {
  const permissions = communityPermissions(c);
  return {
    id: c._id.toString(),
    slug: c.slug,
    name: c.name,
    description: c.description ?? "",
    avatarUrl: c.avatarUrl ?? null,
    memberCount: c.memberCount,
    joinedByMe: myRole !== null,
    myRole,
    permissions,
    actions: {
      publish: meetsCommunityRole(myRole, permissions.publish),
      editAppearance: meetsCommunityRole(myRole, permissions.editAppearance),
      manageMembers: meetsCommunityRole(myRole, "admin"),
    },
    createdAt: c.createdAt.toISOString(),
  };
}
