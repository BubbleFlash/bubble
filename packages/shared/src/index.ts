import { z } from "zod";
export * from "./rateLimits.js";

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only");

export const registerSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  captcha: z.object({
    id: z.string().regex(/^[a-f0-9]{48}$/),
    answer: z.string().trim().max(24),
  }).optional(),
});

export type RegistrationCaptcha = { required: false } | { required: true; id: string; image: string };

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

const passwordField = z.string().min(8).max(128);
// Reset and verification tokens are 48 random bytes, hex encoded.
const tokenField = z.string().regex(/^[a-f0-9]{96}$/, "This link is invalid");

/** The ID token ("credential") that Google Identity Services hands to the browser. */
export const googleLoginSchema = z.object({
  credential: z.string().min(100).max(4096),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z.object({
  token: tokenField,
  password: passwordField,
});

export const verifyEmailSchema = z.object({
  token: tokenField,
});

export const changePasswordSchema = z.object({
  currentPassword: loginSchema.shape.password,
  password: passwordField,
});
export const changeEmailSchema = z.object({
  email: loginSchema.shape.email,
  currentPassword: loginSchema.shape.password,
});
export const confirmEmailChangeSchema = verifyEmailSchema;
export const deleteAccountSchema = z.object({ confirmation: z.literal("УДАЛИТЬ") });

/** Path of a file stored by the upload endpoint, e.g. /uploads/3f2a...c9.png */
export const uploadUrlSchema = z
  .string()
  .regex(/^\/uploads\/[a-f0-9]{32}\.(png|jpg|gif|webp)$/, "Invalid image reference");

/** Largest image the API accepts. Stays under the 4.5 MB request limit of Vercel functions. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Largest photo a person may pick; the app shrinks it before uploading. */
export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export const communitySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, "3 to 24 letters, numbers or underscores");

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i).transform((id) => id.toLowerCase());
export const communityRoleSchema = z.enum(["member", "editor", "admin", "owner"]);
export type CommunityRole = z.infer<typeof communityRoleSchema>;
export const communityPermissionsSchema = z.object({
  publish: communityRoleSchema,
  managePosts: communityRoleSchema,
  editAppearance: communityRoleSchema,
}).strict();
export type CommunityPermissions = z.infer<typeof communityPermissionsSchema>;
export const DEFAULT_COMMUNITY_PERMISSIONS: Readonly<CommunityPermissions> = {
  publish: "member",
  managePosts: "member",
  editAppearance: "admin",
};
export const communityMemberListSchema = z.object({
  q: z.string().trim().max(40).optional(),
  cursor: objectIdSchema.optional(),
});
export const communityMemberRoleSchema = z.object({
  role: communityRoleSchema.exclude(["owner"]),
}).strict();
export const communityMemberNoteSchema = z.object({ note: z.string().trim().max(100) }).strict();
export const communityTeamVisibilitySchema = z.object({ visible: z.boolean() }).strict();
export const communityTransferSchema = z.object({
  userId: objectIdSchema,
  confirmation: communitySlugSchema,
}).strict();

export const createCommunitySchema = z.object({
  slug: communitySlugSchema,
  name: z.string().trim().min(3, "Name needs at least 3 characters").max(48),
  description: z.string().trim().max(280).default(""),
});
export const updateCommunitySchema = z.object({
  name: z.string().trim().min(3).max(48).optional(),
  description: z.string().trim().max(280).optional(),
  avatarUrl: uploadUrlSchema.nullable().optional(),
}).strict();

export const communityListSchema = z.object({
  q: z.string().trim().max(30).optional(),
  mine: z.enum(["1"]).optional(),
  owned: z.enum(["1"]).optional(),
  publishable: z.enum(["1"]).optional(),
});

/** Paid-post prices are in US cents: $1.00 to $500.00. */
/** All accounts can write up to 2000 characters per post. */
export const FREE_POST_LENGTH = 2000;
export const PLUS_POST_LENGTH = 2000;
export const COMMUNITY_POST_LENGTH = 2000;
export const COMMENT_MAX_LENGTH = 1000;

export const musicTrackIdsSchema = z.array(z.string().regex(/^[a-f0-9]{24}$/i).transform((id) => id.toLowerCase())).max(10).refine((ids) => new Set(ids).size === ids.length, "Duplicate music tracks");

export const postVisibilitySchema = z.enum(["public", "private", "friends"]);
export type PostVisibility = z.infer<typeof postVisibilitySchema>;

export const repostSourceSchema = z.object({
  post: objectIdSchema,
  comment: objectIdSchema.optional(),
}).strict();
export type RepostSource = z.infer<typeof repostSourceSchema>;

export const createRepostSchema = z.object({
  source: repostSourceSchema,
  content: z.string().trim().max(PLUS_POST_LENGTH).default(""),
  community: communitySlugSchema.optional(),
}).strict().refine((value) => !value.community || value.content.length <= COMMUNITY_POST_LENGTH, {
  message: `Community posts can have up to ${COMMUNITY_POST_LENGTH} characters`,
  path: ["content"],
});
export type CreateRepostInput = z.infer<typeof createRepostSchema>;

export const createPostSchema = z
  .object({
    content: z.string().trim().max(PLUS_POST_LENGTH),
    imageUrl: uploadUrlSchema.nullish(),
    imageUrls: z.array(uploadUrlSchema).max(10).optional(),
    musicTrackIds: musicTrackIdsSchema.optional(),
    // Slug of a community the author belongs to; the post then appears in that community.
    community: communitySlugSchema.nullish(),
    hideAuthor: z.boolean().optional(),
    adult: z.boolean().optional(),
    visibility: postVisibilitySchema.optional(),
    // Older clients sent null for these fields on ordinary posts.
    priceCents: z.null().optional(),
    premiumContent: z.null().optional(),
  })
  .refine((v) => v.content.length > 0 || Boolean(v.imageUrl) || (v.imageUrls?.length ?? 0) > 0 || (v.musicTrackIds?.length ?? 0) > 0, {
    message: "Write something or attach an image",
    path: ["content"],
  })
  .refine((v) => v.visibility === undefined || v.visibility === "public" || !v.community, {
    message: "Only posts in your profile can be private",
    path: ["visibility"],
  })
  .refine((v) => !v.community || v.content.length <= COMMUNITY_POST_LENGTH, {
    message: `Community posts can have up to ${COMMUNITY_POST_LENGTH} characters`,
    path: ["content"],
  });

export const updateCommunityPostSchema = z.object({
  content: z.string().trim().max(PLUS_POST_LENGTH).optional(),
  imageUrls: z.array(uploadUrlSchema).max(10).optional(),
  musicTrackIds: musicTrackIdsSchema.optional(),
  hideAuthor: z.boolean().optional(),
  adult: z.boolean().optional(),
}).strict().refine((value) => value.content !== undefined || value.imageUrls !== undefined || value.musicTrackIds !== undefined || value.hideAuthor !== undefined || value.adult !== undefined, {
  message: "Provide a change to save",
});
export type UpdateCommunityPostInput = z.infer<typeof updateCommunityPostSchema>;

/** Search results come in pages of 20, up to 10 pages. */
export const SEARCH_PAGE_SIZE = 20;
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(50),
  page: z.coerce.number().int().min(1).max(10).default(1),
});

export const friendsQuerySchema = z.object({
  q: z.string().trim().max(50).default(""),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const profileFriendsQuerySchema = friendsQuerySchema.extend({
  preview: z.literal("1").optional(),
});
export const relationshipsQuerySchema = friendsQuerySchema.extend({
  type: z.enum(["friends", "following", "followers", "outgoing", "incoming"]),
});
export const friendsVisibilitySchema = z.enum(["everyone", "friends", "only_me"]);
export type FriendsVisibility = z.infer<typeof friendsVisibilitySchema>;
export const updateFriendsVisibilitySchema = z
  .object({ friendsVisibility: friendsVisibilitySchema })
  .strict();
export type FriendsAccessDTO =
  { canView: false } | { canView: true; count: number; friendsVisibility?: FriendsVisibility };

export const COMMENTS_PAGE_SIZE = 200;
export const createCommentSchema = z.object({
  content: z.string().trim().max(COMMENT_MAX_LENGTH).default(""),
  imageUrls: z.array(uploadUrlSchema).max(2).optional(),
  musicTrackIds: musicTrackIdsSchema.refine((ids) => ids.length <= 2).optional(),
  parentId: objectIdSchema.optional(),
  mention: z.string().trim().min(1).max(100).optional(),
}).refine((value) => Boolean(value.content || value.imageUrls?.length || value.musicTrackIds?.length), { message: "Write something or attach a file" });

export const appearanceColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i).transform((color) => color.toLowerCase());

export const avatarFrameSchema = z.object({
  effect: z.enum(["glow", "pulse"]),
  color: appearanceColorSchema,
  intensity: z.number().int().min(1).max(5),
}).strict();
export type AvatarFrame = z.infer<typeof avatarFrameSchema>;

export const SITE_FONTS = ["arial", "verdana", "georgia", "times", "consolas"] as const;
export const MAX_FONT_BYTES = 2 * 1024 * 1024;
export const fontUploadUrlSchema = z.string().regex(/^\/uploads\/[a-f0-9]{24}-[a-f0-9]{32}\.(woff2?|ttf|otf)$/);
export const siteFontSchema = z.union([z.enum(SITE_FONTS), fontUploadUrlSchema]);
export type SiteFont = z.infer<typeof siteFontSchema>;
export const MIN_WINDOW_OPACITY = 0;
export const DEFAULT_WINDOW_OPACITY = 100;
export const windowOpacitySchema = z.number().int().min(MIN_WINDOW_OPACITY).max(DEFAULT_WINDOW_OPACITY);

export const siteAppearanceSchema = z.object({
  backgroundUrl: uploadUrlSchema.nullable(),
  primaryColor: appearanceColorSchema.nullable(),
  accentColor: appearanceColorSchema.nullable(),
  font: siteFontSchema.nullable().optional(),
  windowOpacity: windowOpacitySchema.optional(),
}).strict();
export type SiteAppearance = z.infer<typeof siteAppearanceSchema>;

export const updateAppearanceSchema = z.object({
  appearance: siteAppearanceSchema.partial().optional(),
  avatarFrame: avatarFrameSchema.nullable().optional(),
  profileAppearanceVisibility: friendsVisibilitySchema.optional(),
}).strict().refine(({ appearance, avatarFrame, profileAppearanceVisibility }) =>
  avatarFrame !== undefined || profileAppearanceVisibility !== undefined || (appearance && Object.keys(appearance).length > 0),
);
export type UpdateAppearanceInput = z.infer<typeof updateAppearanceSchema>;

export const DISPLAY_NAME_MAX_LENGTH = 40;
export const displayNameSchema = z.string().trim().min(1, "Display name is required")
  .max(DISPLAY_NAME_MAX_LENGTH, "Display name is too long")
  .regex(/^[^\p{Cc}\p{Bidi_Control}]+$/u, "Invalid display name");

export function displayNameOf(person: { username: string; displayName?: string | null }): string {
  return person.displayName || person.username;
}

export const updateProfileSchema = z.object({
  bio: z.string().trim().max(160).optional(),
  displayName: displayNameSchema.optional(),
  avatarUrl: uploadUrlSchema.nullable().optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  feed: z.enum(["all", "following"]).default("all"),
});

// ---- Wallpaper workshop ----

export const WALLPAPER_NAME_MAX_LENGTH = 80;
export const wallpaperNameSchema = z.string().trim().min(1, "Wallpaper name is required").max(WALLPAPER_NAME_MAX_LENGTH, "Wallpaper name is too long");
export const unnamedWallpaper = "Без названия";
export const wallpaperViewSchema = z.enum(["popular", "new", "friends", "favorites"]);
export type WallpaperView = z.infer<typeof wallpaperViewSchema>;
export const wallpaperQuerySchema = z.object({
  view: wallpaperViewSchema.default("popular"),
  q: z.string().trim().max(WALLPAPER_NAME_MAX_LENGTH).default(""),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
});

export interface WallpaperDTO {
  id: string;
  name: string;
  imageUrl: string;
  author: string;
  mine: boolean;
  likeCount: number;
  liked: boolean;
  favorite: boolean;
  usedByFriends: boolean;
}

export interface WallpaperPage {
  items: WallpaperDTO[];
  totalPages: number;
}

// ---- Moderation ----

export const REPORT_REASONS = ["spam", "harassment", "hate", "violence", "other"] as const;
export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;

export const createReportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(300).optional(),
});

export const resolveReportSchema = z.object({
  action: z.enum(["remove_post", "remove_post_and_ban"]),
});

export const banUserSchema = z.object({
  removePosts: z.boolean().default(false),
});

export const reportQuerySchema = paginationSchema.omit({ feed: true }).extend({
  status: z.enum(REPORT_STATUSES).default("open"),
});

// ---- Direct messages, news and contact ----

export const MESSAGE_MAX_LENGTH = 2000;
export const editMessageSchema = z.object({ text: z.string().trim().max(MESSAGE_MAX_LENGTH) }).strict();
export const linkPreviewSchema = z.object({ url: z.string().max(2048).url() });
export const sendMessageSchema = z.object({
  text: z.string().trim().max(MESSAGE_MAX_LENGTH).default(""),
  musicTrackIds: musicTrackIdsSchema.optional(),
  imageIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i).transform((id) => id.toLowerCase())).max(10).refine((ids) => new Set(ids).size === ids.length).optional(),
  clientMessageId: z.string().uuid().optional(),
  repost: repostSourceSchema.optional(),
}).refine((value) => Boolean(value.text || value.musicTrackIds?.length || value.imageIds?.length || value.repost), { message: "Write a message or attach a file", path: ["text"] });
export const messagesQuerySchema = z.object({
  /** Timestamp and message id; legacy ISO-only cursors still work. */
  cursor: z.string().refine((cursor) => {
    const [timestamp, id, extra] = cursor.split("~");
    return extra === undefined && z.iso.datetime().safeParse(timestamp).success &&
      (id === undefined || objectIdSchema.safeParse(id).success);
  }, "Invalid message cursor").optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const NEWS_TOPICS = ["top", "world", "technology", "business", "sport"] as const;
export type NewsTopic = (typeof NEWS_TOPICS)[number];
export const newsQuerySchema = z.object({
  topic: z.enum(NEWS_TOPICS).default("top"),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(120),
  message: z.string().trim().min(10, "Write at least 10 characters").max(2000),
  /** Honeypot: real people never fill this in. Bots do, and get a silent success. */
  website: z.string().max(200).optional(),
});

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  musicAttachments?: MusicAttachmentDTO[];
  imageIds?: string[];
  hasRepost?: boolean;
  repost?: RepostPreviewDTO;
  clientMessageId?: string;
  createdAt: string;
  editedAt?: string;
}

export interface ConversationDTO {
  id: string;
  other: UserSummaryDTO;
  lastMessage: { text: string; senderId: string; createdAt: string } | null;
  lastMessageAt: string;
  unread: number;
  /** True when the other person has read everything and your message is the latest one. */
  seenByOther: boolean;
}

export interface MessagePage {
  items: MessageDTO[]; // oldest first
  nextCursor: string | null;
}

export interface NewsItemDTO {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
}

export type ContactInput = z.infer<typeof contactSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
export type BanUserInput = z.infer<typeof banUserSchema>;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type Role = "user" | "moderator" | "admin";

export interface PublicUser {
  id: string;
  username: string;
  displayName?: string;
  bio: string;
  avatarUrl: string | null;
  avatarFrame?: AvatarFrame;
  role: Role;
  /** Has an active Commune Plus subscription. */
  plus: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface AccountUser extends PublicUser {
  email?: string;
  profileAppearanceVisibility?: FriendsVisibility;
  appearance?: Partial<SiteAppearance>;
}

export interface AuthorDTO {
  online?: boolean;
  id: string;
  username: string;
  displayName?: string;
  avatarUrl: string | null;
  avatarFrame?: AvatarFrame;
  /** Has an active Commune Plus subscription. */
  plus: boolean;
}

export interface PostDTO {
  id: string;
  pinned?: boolean;
  canPin?: boolean;
  content: string;
  hideAuthor?: boolean;
  adult?: boolean;
  imageUrl: string | null;
  imageUrls?: string[];
  musicAttachments: MusicAttachmentDTO[];
  author: AuthorDTO;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  /** A share's original post. Null if the viewer cannot access the original. */
  likePostId?: string | null;
  repostCount?: number;
  repost?: RepostPreviewDTO;
  visibility?: PostVisibility;
  /** The community this post was made in, if any. */
  community: { slug: string; name: string; avatarUrl?: string | null; creatorId?: string } | null;
  communityActions?: { edit: boolean; delete: boolean };
  createdAt: string;
}

interface RepostPreviewContent {
  postId: string;
  author: AuthorDTO;
  content: string;
  createdAt: string;
}

export type RepostPreviewDTO =
  | { kind: "unavailable" }
  | { kind: "link"; postId: string }
  | (RepostPreviewContent & { kind: "comment"; commentId: string })
  | (RepostPreviewContent & {
      kind: "post";
      hideAuthor?: boolean;
      adult?: boolean;
      imageUrls: string[];
      musicAttachments: MusicAttachmentDTO[];
      community?: { slug: string; name: string; avatarUrl?: string | null };
      repost?: RepostPreviewDTO;
    });

export type MusicAttachmentDTO =
  | { id: string; title: string; artist: string; duration: number | null; unavailable: false }
  | { id: string; unavailable: true };

export interface UserSummaryDTO {
  id: string;
  online?: boolean;
  username: string;
  displayName?: string;
  bio: string;
  avatarUrl: string | null;
  avatarFrame?: AvatarFrame;
  plus: boolean;
  followedByMe?: boolean;
  followsMe?: boolean;
}

export interface BillingDTO {
  plus: boolean;
  /** When Plus access ends (or the next renewal grace period ends). Null if never subscribed. */
  plusUntil: string | null;
  /** Subscription is cancelled: access continues until plusUntil, then stops. */
  cancelled: boolean;
  status: string | null;
  /** Next charge (or the end of the paid period). Null if never subscribed. */
  renewsAt: string | null;
  endsAt: string | null;
  /** The last renewal payment failed and the card needs updating. */
  pastDue: boolean;
  /** This server accepts Lemon Squeezy test-mode payments: nothing real is charged. */
  testMode: boolean;
  priceLabel: string;
  /** False when payments aren't set up on this server. */
  available: boolean;
}

export interface InsightsDTO {
  totals: {
    posts: number;
    views: number;
    likes: number;
    comments: number;
    followers: number;
    newFollowers30d: number;
  };
  /** One entry per day for the last 30 days, oldest first. */
  daily: { day: string; views: number }[];
  topPosts: {
    id: string;
    content: string;
    views: number;
    likes: number;
    comments: number;
    createdAt: string;
  }[];
}

export interface CommunityDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatarUrl?: string | null;
  memberCount: number;
  joinedByMe: boolean;
  myRole: CommunityRole | null;
  permissions: CommunityPermissions;
  actions: { publish: boolean; editAppearance: boolean; manageMembers: boolean };
  createdAt: string;
}

export interface CommunityMemberDTO {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role: CommunityRole;
  note?: string;
  visibleInTeam?: boolean;
}

export interface ServerFundraiserDTO {
  title: string;
  current: number;
  target: number;
  updatedAt: string;
}

export interface CheckoutResponse {
  url: string;
}

export interface EarningsDTO {
  currency: string;
  sales: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
}

export interface CommentDTO {
  id: string;
  postId: string;
  parentId: string | null;
  mention?: { name: string; username: string };
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
  content: string;
  imageUrls?: string[];
  musicAttachments?: MusicAttachmentDTO[];
  author: AuthorDTO;
  createdAt: string;
}

export interface AuthResponse {
  user: AccountUser;
  accessToken: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ProfileDTO extends PublicUser {
  profileAppearance?: Partial<SiteAppearance>;
  online?: boolean;
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
  followsMe: boolean;
  banned: boolean;
}

export const notificationTypes = ["follow", "like", "comment", "repost"] as const;
const notificationTypeSchema = z.enum(notificationTypes);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationQuerySchema = z.object({
  type: notificationTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(49).transform((value) => value.split("|")).pipe(z.tuple([
    z.iso.datetime({ precision: 3 }),
    z.string().regex(/^[a-f0-9]{24}$/i),
  ])).optional(),
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
export const notificationPreferenceSchema = z.object({
  type: notificationTypeSchema,
  visible: z.boolean(),
  sound: z.boolean(),
});
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;
export type NotificationPreferences = Record<NotificationType, Omit<NotificationPreference, "type">>;

export const readNotificationsSchema = z.object({
  all: z.boolean().optional(),
  type: notificationTypeSchema.optional(),
  through: z.string().datetime().optional(),
  items: z.array(z.object({
    id: z.string().regex(/^[a-f0-9]{24}$/i),
    createdAt: z.string().datetime(),
  })).min(1).max(100).optional(),
});
export type ReadNotificationsInput = z.infer<typeof readNotificationsSchema>;

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  actor: Pick<PublicUser, "id" | "username" | "displayName"> & { avatarUrl?: string | null; avatarFrame?: AvatarFrame };
  postId: string | null;
  commentId?: string;
  postComment?: boolean;
  read: boolean;
  createdAt: string;
}

export interface NotificationNewEvent {
  notification?: NotificationDTO;
  sound?: boolean;
  readStateChanged?: boolean;
}

export interface UploadResponse {
  url: string;
}


/** Supported audio formats for the music library. */
export const ALLOWED_MUSIC_TYPES = [
  "audio/mpeg",
  "audio/flac",
  "audio/x-flac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
] as const;

/** Maximum audio file size: 100 MB. */
export const MAX_MUSIC_BYTES = 100 * 1024 * 1024;

export const musicUploadSignSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  mimeType: z.enum(ALLOWED_MUSIC_TYPES),
  size: z.number().int().min(1).max(MAX_MUSIC_BYTES),
});

export const musicUploadCompleteSchema = z.object({
  background: z.boolean().optional(),
  uploadId: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid upload ID"),
  duration: z.number().finite().positive().max(604800).optional(),
});

export const musicRenameSchema = z.object({ title: z.string().trim().min(1).max(200), artist: z.string().trim().min(1).max(200) }).strict();

export const musicListQuerySchema = z.object({
  scope: z.enum(["all", "mine"]).default("all"),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const musicPickerQuerySchema = z.object({
  scope: z.enum(["all", "mine"]).default("all"),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

export const musicSettingsSchema = z.object({
  visibility: z.enum(["everyone", "friends", "private"]),
}).strict();

export const profileMusicQuerySchema = z.object({
  cursor: z.string().regex(/^\d{13}-[a-f0-9]{24}$/i).optional(),
});

export type MusicSettings = z.infer<typeof musicSettingsSchema>;
export type ProfileMusicResponse =
  | { status: "hidden" }
  | { status: "visible"; tracks: MusicTrackDTO[]; nextCursor: string | null };

export const musicTrackIdSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid track ID"),
});
export const musicLibraryStatusSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i).transform((id) => id.toLowerCase())).max(100),
});

export type MusicUploadSignInput = z.infer<typeof musicUploadSignSchema>;
export type MusicUploadCompleteInput = z.infer<typeof musicUploadCompleteSchema>;
export type MusicUploadResult = { trackId: string } | { processing: true };
export type MusicListQuery = z.infer<typeof musicListQuerySchema>;

export interface MusicUploadTicket {
  uploadId: string;
  url: string;
}

export interface MusicTrackDTO {
  id: string;
  title: string;
  artist: string;
  mimeType: string;
  size: number;
  duration: number | null;
  addedAt: string | null;
  addedByMe: boolean;
  editableUntil?: string;
}


/** Step two of a direct-to-storage upload: tell the API which file the browser uploaded. */
export const completeUploadSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/, "Invalid upload id"),
  format: z.enum(["png", "jpg", "jpeg", "gif", "webp"]),
});

/** "server": send the file to the API. "direct": the browser uploads to cloud storage itself. */
export type UploadTicket =
  | { mode: "server" }
  | {
      mode: "direct";
      uploadUrl: string;
      apiKey: string;
      timestamp: string;
      publicId: string;
      allowedFormats: string;
      signature: string;
    };

export interface ReportDTO {
  id: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  reporter: Pick<PublicUser, "id" | "username" | "displayName">;
  /** null when the reported post has since been deleted */
  post: { id: string; content: string; imageUrl: string | null; author: AuthorDTO } | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CommentReportDTO {
  id: string;
  postId: string;
  reason: ReportReason;
  details: string;
  reporter: { username: string; displayName?: string };
  comment: { id: string; content: string; author: { username: string; displayName?: string } | null } | null;
  createdAt: string;
}

// ---- Monitoring ----

/** Sent by the browser when something throws. Kept small: no personal data is needed. */
export const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(300),
  stack: z.string().max(2000).optional(),
  source: z.enum(["window", "promise", "react"]),
  category: z.enum(["chunk", "render"]).optional(),
  /** Page path only, never the query string. */
  path: z.string().max(200).default("/"),
});
export type ClientErrorInput = z.infer<typeof clientErrorSchema>;

export interface ErrorEventDTO {
  id: string;
  source: "api" | "web";
  message: string;
  route: string;
  status: number | null;
  category?: string;
  upstreamStatus?: number | null;
  requestId?: string;
  stack: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  resolved: boolean;
}

export * from "./telemetry.js";

// ---- Realtime (Socket.IO) ----

/** Events the API pushes to users through the realtime service. */
export type PushedEvent = "message:new" | "message:read" | "message:changed" | "notification:new";

export interface MessageNewEvent {
  message: MessageDTO;
}
export interface MessageReadEvent {
  conversationId: string;
  readerId: string;
}
export interface MessageChangedEvent {
  conversationId: string;
}
/** Sent between the two people in a conversation. */
export interface TypingEvent {
  conversationId: string;
  userId: string;
  typing: boolean;
}
export interface PresenceEvent {
  userId: string;
  online: boolean;
}

// ---- Web Push ----

/**
 * Push subscriptions come from the browser, and the server sends a request to the address in
 * them. Only the real push services are accepted, so nobody can make the server call an
 * arbitrary address.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Android, Samsung
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^([a-z0-9-]+\.)*push\.apple\.com$/, // Safari and iPhone
  /^([a-z0-9-]+\.)*notify\.windows\.com$/, // Edge on Windows
];

export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export const pushSubscribeSchema = z.object({
  endpoint: z
    .string()
    .max(600)
    .refine(isAllowedPushEndpoint, "This browser's push service is not supported"),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{60,120}$/, "Invalid key"),
    auth: z.string().regex(/^[A-Za-z0-9_-]{16,40}$/, "Invalid key"),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().max(600) });

export const pushPreferencesSchema = z.object({
  messages: z.boolean(),
  social: z.boolean(),
});
export type PushPreferences = z.infer<typeof pushPreferencesSchema>;

export interface PushStatus {
  /** False when the server has no VAPID keys: hide the feature. */
  enabled: boolean;
  publicKey: string | null;
  preferences: PushPreferences;
}
