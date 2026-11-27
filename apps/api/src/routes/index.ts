import { Router } from "express";
import type { RequestHandler } from "express";
import {
  banUserSchema,
  clientErrorSchema,
  clientNetworkBatchSchema,
  telemetryQuerySchema,
  pushPreferencesSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  notificationPreferenceSchema,
  notificationQuerySchema,
  readNotificationsSchema,
  contactSchema,
  messagesQuerySchema,
  editMessageSchema,
  linkPreviewSchema,
  musicUploadSignSchema,
  musicUploadCompleteSchema,
  musicListQuerySchema,
  musicPickerQuerySchema,
  musicTrackIdSchema,
  musicRenameSchema,
  musicLibraryStatusSchema,
  musicSettingsSchema,
  profileMusicQuerySchema,
  newsQuerySchema,
  sendMessageSchema,
  communityListSchema,
  communityMemberListSchema,
  communityMemberRoleSchema,
  communityMemberNoteSchema,
  communityTeamVisibilitySchema,
  communityPermissionsSchema,
  communityTransferSchema,
  createCommentSchema,
  createCommunitySchema,
  updateCommunitySchema,
  updateCommunityPostSchema,
  createPostSchema,
  createRepostSchema,
  createReportSchema,
  forgotPasswordSchema,
  gameLinkSchema,
  changePasswordSchema,
  changeEmailSchema,
  confirmEmailChangeSchema,
  deleteAccountSchema,
  googleLoginSchema,
  loginSchema,
  paginationSchema,
  registerSchema,
  reportQuerySchema,
  relationshipsQuerySchema,
  friendsQuerySchema,
  profileFriendsQuerySchema,
  updateFriendsVisibilitySchema,
  resetPasswordSchema,
  resolveReportSchema,
  searchQuerySchema,
  updateAppearanceSchema,
  updateProfileSchema,
  verifyEmailSchema,
  wallpaperQuerySchema,
} from "@commune/shared";
import * as music from "../controllers/musicController.js";
import * as account from "../controllers/accountController.js";
import * as push from "../controllers/pushController.js";
import * as internal from "../controllers/internalController.js";
import * as monitor from "../controllers/monitorController.js";
import * as contact from "../controllers/contactController.js";
import * as messages from "../controllers/messageController.js";
import * as news from "../controllers/newsController.js";
import * as serverFundraiser from "../controllers/serverFundraiserController.js";
import * as developmentWidget from "../controllers/developmentWidgetController.js";
import * as siteContent from "../controllers/siteContentController.js";
import * as gameCatalog from "../controllers/gameCatalogController.js";
import * as feedbackExport from "../controllers/feedbackExportController.js";
import * as billing from "../controllers/billingController.js";
import * as insights from "../controllers/insightsController.js";
import * as admin from "../controllers/adminController.js";
import * as auth from "../controllers/authController.js";
import * as payments from "../controllers/paymentController.js";
import * as communities from "../controllers/communityController.js";
import * as notifications from "../controllers/notificationController.js";
import * as posts from "../controllers/postController.js";
import * as reports from "../controllers/reportController.js";
import * as publicApi from "../controllers/publicController.js";
import * as search from "../controllers/searchController.js";
import * as uploads from "../controllers/uploadController.js";
import * as wallpapers from "../controllers/wallpaperController.js";
import * as users from "../controllers/userController.js";
import * as relationships from "../controllers/relationshipController.js";
import * as moderation from "../controllers/moderationController.js";
import * as testGate from "../controllers/testGateController.js";
import * as rateLimitSettings from "../controllers/rateLimitController.js";
import * as fundraiserSettings from "../controllers/fundraiserSettingsController.js";
import * as feedMute from "../controllers/feedMuteController.js";
import { requireActive, requireAdmin, requireAuth, requireModerator, requirePlus, requirePublishing } from "../middleware/auth.js";
import {
  authLimiter,
  accountActionLimiter,
  allowRegistrationRequest,
  clientErrorLimiter,
  pushLimiter,
  readLimiter,
  testPushLimiter,
  checkoutLimiter,
  contactLimiter,
  communityLimiter,
  emailLimiter,
  reportLimiter,
  publicLimiter,
  refreshLimiter,
  refreshLookupLimiter,
  searchLimiter,
  linkPreviewLimiter,
  uploadLimiter,
  viewLimiter,
} from "../middleware/rateLimit.js";
import { parseFontUpload, parseImageUpload } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/errors.js";
import { loadLinkPreview } from "../services/linkPreview.js";

export const router = Router();
const privateMusicResponse: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
};

/**
 * Middleware order on write routes:  requireAuth -> (limiter) -> validate -> requireActive.
 * Validation runs before the database lookup in requireActive so malformed requests are
 * rejected cheaply. Reads only need requireAuth. Admin routes check the role first.
 */
const adminOnly = [requireAuth, requireActive, requireAdmin];
const staff = [requireAuth, requireActive, requireModerator];
router.put("/admin/feed-pin/:id", ...adminOnly, asyncHandler(posts.pinFeedPost));
router.get("/admin/feed-pin", ...adminOnly, asyncHandler(posts.getFeedPin));
router.delete("/admin/feed-pin/:id", ...adminOnly, asyncHandler(posts.pinFeedPost));
router.get("/feed-mutes/users", requireAuth, asyncHandler(feedMute.list));
router.get("/feed-mutes/:kind/:name", requireAuth, asyncHandler(feedMute.get));
router.put("/feed-mutes/:kind/:name", requireAuth, requireActive, asyncHandler(feedMute.update));
router.delete("/feed-mutes/:kind/:name", requireAuth, requireActive, asyncHandler(feedMute.update));
router.get("/admin/fundraiser", ...adminOnly, asyncHandler(fundraiserSettings.getSettings));
router.put("/admin/fundraiser", ...adminOnly, asyncHandler(fundraiserSettings.updateSettings));
router.get("/admin/rate-limits", ...adminOnly, asyncHandler(rateLimitSettings.getSettings));
router.put("/admin/rate-limits", ...adminOnly, asyncHandler(rateLimitSettings.updateSettings));
router.put("/admin/rate-limits/captcha", ...adminOnly, asyncHandler(rateLimitSettings.updateCaptcha));
router.put("/admin/rate-limits/:name", ...adminOnly, asyncHandler(rateLimitSettings.updateRule));
router.get("/admin/registration", ...adminOnly, asyncHandler(rateLimitSettings.getRegistrationSettings));
router.put("/admin/registration", ...adminOnly, asyncHandler(rateLimitSettings.updateRegistrationSettings));
router.get("/admin/test-gate", ...adminOnly, asyncHandler(testGate.getSettings));
router.put("/admin/test-gate", ...adminOnly, asyncHandler(testGate.updateSettings));
router.get("/admin/development-widget", ...adminOnly, asyncHandler(developmentWidget.settings));
router.put("/admin/development-widget", ...adminOnly, asyncHandler(developmentWidget.update));
router.get("/admin/site-content", ...adminOnly, asyncHandler(siteContent.getContent));
router.put("/admin/site-content", ...adminOnly, asyncHandler(siteContent.updateContent));
router.get("/admin/site-team", ...adminOnly, asyncHandler(siteContent.getTeamSettings));
router.put("/admin/site-team", ...adminOnly, asyncHandler(siteContent.updateTeamSettings));

// Health checks. /health only says the process is up; /health/ready also checks the database
// and is the one for an uptime monitor. Neither reveals versions, paths or settings.
router.get("/health", monitor.live);
router.get("/health/ready", monitor.ready);
router.get("/internal/session", asyncHandler(internal.verifySession));
router.post("/link-preview", requireAuth, linkPreviewLimiter, validate(linkPreviewSchema), asyncHandler(async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.json({ preview: await loadLinkPreview(req.body.url) });
}));

// Used only by the realtime service (shared secret; 404 for everyone else).
router.get(
  "/internal/conversations/:id/participants",
  asyncHandler(internal.conversationParticipants),
);

// Errors from the browser (public: they can happen before sign-in; rate limited and capped).
router.post(
  "/client-errors",
  clientErrorLimiter,
  validate(clientErrorSchema),
  asyncHandler(monitor.reportClientError),
);
router.post("/client-network", validate(clientNetworkBatchSchema), monitor.reportNetwork);

// Auth
router.post("/auth/register/captcha", asyncHandler(auth.registrationCaptcha));
router.post("/auth/register", asyncHandler(async (req, res, next) => {
  if (await allowRegistrationRequest(req, res, "registration")) next();
}), validate(registerSchema), asyncHandler(auth.register));
router.post("/auth/login", authLimiter, validate(loginSchema), asyncHandler(auth.login));
router.post("/auth/google", authLimiter, validate(googleLoginSchema), asyncHandler(auth.google));
router.post("/auth/refresh", refreshLookupLimiter, asyncHandler(auth.prepareRefresh), refreshLimiter, asyncHandler(auth.refresh));
router.post("/auth/logout", asyncHandler(auth.logout));
router.post("/auth/change-password", requireAuth, authLimiter, validate(changePasswordSchema), asyncHandler(account.changePassword));
router.post("/auth/change-email", requireAuth, emailLimiter, authLimiter, validate(changeEmailSchema), asyncHandler(account.changeEmail));
router.post("/auth/confirm-email-change", authLimiter, validate(confirmEmailChangeSchema), asyncHandler(account.confirmEmailChange));
router.post("/auth/delete-account", requireAuth, authLimiter, validate(deleteAccountSchema), asyncHandler(account.deleteAccount));

// Email verification and password reset
router.post(
  "/auth/forgot-password",
  emailLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(account.forgotPassword),
);
router.post(
  "/auth/reset-password",
  authLimiter,
  validate(resetPasswordSchema),
  asyncHandler(account.resetPassword),
);
router.post(
  "/auth/verify-email",
  authLimiter,
  validate(verifyEmailSchema),
  asyncHandler(account.verifyEmail),
);
router.post(
  // No requireActive here: with REQUIRE_VERIFIED_EMAIL on, unverified users must still be able
  // to ask for a new link. The controller rejects suspended accounts itself.
  "/auth/resend-verification",
  requireAuth,
  emailLimiter,
  asyncHandler(account.resendVerification),
);

// Public, read-only (no login): powers the Explore page that search engines and ad
// reviewers can see. Only free posts are ever returned.
router.get(
  "/public/posts",
  publicLimiter,
  validate(paginationSchema, "query"),
  asyncHandler(publicApi.listPosts),
);
router.get("/public/posts/:id", publicLimiter, asyncHandler(publicApi.getPost));
router.get("/profile-presence", requireAuth, publicLimiter, asyncHandler(users.onlineProfiles));

// Uploads (auth and rate limit run before the file is parsed)
router.post(
  "/uploads",
  requireAuth,
  uploadLimiter,
  parseImageUpload,
  requireActive,
  asyncHandler(uploads.upload),
);

router.post("/uploads/font", requireAuth, uploadLimiter, requireActive, parseFontUpload, asyncHandler(uploads.uploadFont));

router.get("/wallpapers", requireAuth, validate(wallpaperQuerySchema, "query"), asyncHandler(wallpapers.list));
router.post("/wallpapers", requireAuth, uploadLimiter, requireActive, parseImageUpload, asyncHandler(wallpapers.publish));
for (const kind of ["like", "favorite"] as const) {
  router.put(`/wallpapers/:id/${kind}`, requireAuth, requireActive, asyncHandler(wallpapers.reactToWallpaper(kind, true)));
  router.delete(`/wallpapers/:id/${kind}`, requireAuth, requireActive, asyncHandler(wallpapers.reactToWallpaper(kind, false)));
}
router.post("/wallpapers/:id/report", requireAuth, reportLimiter, validate(createReportSchema), requireActive, asyncHandler(wallpapers.report));

router.post(
  "/music/uploads/sign",
  requireAuth,
  uploadLimiter,
  validate(musicUploadSignSchema),
  requireActive,
  asyncHandler(music.signUpload),
);

router.post(
  "/music/uploads/complete",
  requireAuth,
  uploadLimiter,
  validate(musicUploadCompleteSchema),
  requireActive,
  asyncHandler(music.completeUpload),
);

router.get("/music/picker", requireAuth, validate(musicPickerQuerySchema, "query"), asyncHandler(music.picker));
router.post("/music/library/status", requireAuth, validate(musicLibraryStatusSchema), asyncHandler(music.libraryStatuses));
router.patch("/music/:id", requireAuth, validate(musicTrackIdSchema, "params"), validate(musicRenameSchema), requireActive, asyncHandler(music.rename));
router.get(
  "/music",
  requireAuth,
  validate(musicListQuerySchema, "query"),
  asyncHandler(music.list),
);

router.post(
  "/music/:id/library",
  requireAuth,
  validate(musicTrackIdSchema, "params"),
  requireActive,
  asyncHandler(music.addToLibrary),
);

router.get(
  "/music/:id/library",
  requireAuth,
  validate(musicTrackIdSchema, "params"),
  asyncHandler(music.libraryStatus),
);

router.delete(
  "/music/:id/library",
  requireAuth,
  validate(musicTrackIdSchema, "params"),
  requireActive,
  asyncHandler(music.removeFromLibrary),
);

router.get(
  "/music/:id/download",
  requireAuth,
  validate(musicTrackIdSchema, "params"),
  asyncHandler(music.download),
);

router.get(
  "/music/:id/play",
  requireAuth,
  validate(musicTrackIdSchema, "params"),
  asyncHandler(music.play),
);

// Users. "/users/me" must be declared before "/users/:username".
router.get("/users/me", requireAuth, asyncHandler(users.me));
router.get("/users/me/music-settings", privateMusicResponse, requireAuth, asyncHandler(users.getMusicSettings));
router.patch("/users/me/music-settings", privateMusicResponse, requireAuth, validate(musicSettingsSchema), requireActive, asyncHandler(users.updateMusicSettings));
router.get("/users/:username/music", privateMusicResponse, requireAuth, validate(profileMusicQuerySchema, "query"), asyncHandler(users.userMusic));
router.patch(
  "/users/me",
  requireAuth,
  validate(updateProfileSchema),
  requireActive,
  asyncHandler(users.updateMe),
);
router.patch(
  "/users/me/appearance",
  requireAuth,
  validate(updateAppearanceSchema),
  requireActive,
  asyncHandler(users.updateAppearance),
);
router.get("/users/me/earnings", requireAuth, asyncHandler(payments.earnings));
router.patch(
  "/users/me/friends-visibility",
  requireAuth,
  validate(updateFriendsVisibilitySchema),
  requireActive,
  asyncHandler(relationships.updateVisibility),
);
router.get(
  "/users/me/relationships",
  requireAuth,
  validate(relationshipsQuerySchema, "query"),
  asyncHandler(relationships.list),
);
router.get("/users/:username", requireAuth, asyncHandler(users.getProfile));
router.get("/users/me/relationships/counts", requireAuth, asyncHandler(relationships.counts));
router.get("/users/:username/friends/access", requireAuth, asyncHandler(relationships.access));
router.put("/users/:username/posts/:id/pin", requireAuth, requireActive, asyncHandler(users.pinPost));
router.delete("/users/:username/posts/:id/pin", requireAuth, requireActive, asyncHandler(users.pinPost));
router.get(
  "/users/:username/friends",
  requireAuth,
  validate(profileFriendsQuerySchema, "query"),
  asyncHandler(relationships.friends),
);
router.get(
  "/users/:username/posts",
  requireAuth,
  validate(paginationSchema, "query"),
  asyncHandler(users.userPosts),
);
router.post(
  "/users/:username/follow",
  requireAuth,
  requireActive,
  asyncHandler(users.toggleFollow),
);
router.put("/users/:username/follow", requireAuth, requireActive, asyncHandler(users.follow));
router.delete("/users/:username/follow", requireAuth, requireActive, asyncHandler(users.unfollow));
router.delete("/users/:username/friend-request", requireAuth, requireActive, asyncHandler(users.declineFriendRequest));

// Notifications
router.get(
  "/notifications",
  requireAuth,
  validate(notificationQuerySchema, "query"),
  asyncHandler(notifications.list),
);
router.get("/notifications/unread-count", requireAuth, asyncHandler(notifications.unreadCount));
router.post(
  "/notifications/read",
  requireAuth,
  validate(readNotificationsSchema.optional()),
  asyncHandler(notifications.markAllRead),
);
router.get("/notifications/preferences", requireAuth, asyncHandler(notifications.preferences));
router.patch(
  "/notifications/preferences",
  requireAuth,
  validate(notificationPreferenceSchema),
  asyncHandler(notifications.savePreference),
);

// Commune Plus: billing and creator insights
router.get("/billing", requireAuth, asyncHandler(billing.status));
router.post(
  "/billing/checkout",
  requireAuth,
  checkoutLimiter,
  requireActive,
  asyncHandler(billing.checkout),
);
router.post("/billing/portal", requireAuth, checkoutLimiter, asyncHandler(billing.portal));
router.get("/insights", requireAuth, requirePlus, asyncHandler(insights.get));

// Search
router.get("/search/people", requireAuth, searchLimiter, validate(friendsQuerySchema, "query"), asyncHandler(search.people));
router.get(
  "/search/users",
  requireAuth,
  searchLimiter,
  validate(searchQuerySchema, "query"),
  asyncHandler(search.users),
);
router.get(
  "/search/posts",
  requireAuth,
  searchLimiter,
  validate(searchQuerySchema, "query"),
  asyncHandler(search.posts),
);

// Communities
router.get(
  "/communities",
  requireAuth,
  validate(communityListSchema, "query"),
  asyncHandler(communities.list),
);
router.post(
  "/communities",
  requireAuth,
  communityLimiter,
  validate(createCommunitySchema),
  requireActive,
  asyncHandler(communities.create),
);
router.get("/communities/:slug", requireAuth, asyncHandler(communities.get));
router.put("/communities/:slug/posts/:id/pin", requireAuth, requireActive, asyncHandler(communities.pinPost));
router.delete("/communities/:slug/posts/:id/pin", requireAuth, requireActive, asyncHandler(communities.pinPost));
router.patch("/communities/:slug", requireAuth, requireActive, validate(updateCommunitySchema), asyncHandler(communities.update));
router.put("/communities/:slug/permissions", requireAuth, requireActive, validate(communityPermissionsSchema), asyncHandler(communities.updatePermissions));
router.get("/communities/:slug/members", requireAuth, validate(communityMemberListSchema, "query"), asyncHandler(communities.members));
router.get("/communities/:slug/managers", requireAuth, validate(communityMemberListSchema, "query"), asyncHandler(communities.managers));
router.get("/communities/:slug/team", requireAuth, validate(communityMemberListSchema, "query"), asyncHandler(communities.team));
router.put("/communities/:slug/members/:userId/note", requireAuth, requireActive, validate(communityMemberNoteSchema), asyncHandler(communities.updateMemberNote));
router.put("/communities/:slug/members/:userId/team-visibility", requireAuth, requireActive, validate(communityTeamVisibilitySchema), asyncHandler(communities.updateTeamVisibility));
router.put("/communities/:slug/members/:userId/role", requireAuth, requireActive, validate(communityMemberRoleSchema), asyncHandler(communities.updateMemberRole));
router.delete("/communities/:slug/members/:userId", requireAuth, requireActive, asyncHandler(communities.removeMember));
router.post("/communities/:slug/transfer", requireAuth, requireActive, validate(communityTransferSchema), asyncHandler(communities.transfer));
router.get(
  "/communities/:slug/posts",
  requireAuth,
  validate(paginationSchema, "query"),
  asyncHandler(communities.posts),
);
router.post("/communities/:slug/join", requireAuth, requireActive, asyncHandler(communities.join));
router.delete(
  "/communities/:slug/join",
  requireAuth,
  requireActive,
  asyncHandler(communities.leave),
);

// Posts
router.get(
  "/posts",
  requireAuth,
  validate(paginationSchema, "query"),
  asyncHandler(posts.listPosts),
);
router.post(
  "/posts",
  requireAuth,
  validate(createPostSchema),
  requireActive,
  requirePublishing,
  accountActionLimiter("post-create"),
  asyncHandler(posts.createPost),
);
router.post(
  "/posts/reposts",
  requireAuth,
  validate(createRepostSchema),
  requireActive,
  requirePublishing,
  accountActionLimiter("post-create"),
  asyncHandler(posts.createRepost),
);
router.get("/posts/:id", requireAuth, asyncHandler(posts.getPost));
router.patch("/posts/:id", requireAuth, requireActive, requirePublishing, validate(updateCommunityPostSchema), asyncHandler(posts.updatePost));
router.delete("/posts/:id", requireAuth, requireActive, asyncHandler(posts.deletePost));
router.post("/posts/:id/like", requireAuth, requireActive, asyncHandler(posts.setPostLike));
router.put("/posts/:id/like", requireAuth, requireActive, asyncHandler(posts.setPostLike));
router.delete("/posts/:id/like", requireAuth, requireActive, asyncHandler(posts.setPostLike));
router.post("/posts/:id/view", requireAuth, viewLimiter, asyncHandler(posts.trackView));
router.get("/posts/:id/comments", requireAuth, asyncHandler(posts.listComments));
router.post(
  "/posts/:id/comments",
  requireAuth,
  validate(createCommentSchema),
  requireActive,
  requirePublishing,
  accountActionLimiter("comment-create"),
  asyncHandler(posts.addComment),
);
router.put("/posts/:id/comments/:commentId/like", requireAuth, requireActive, asyncHandler(posts.setCommentLike));
router.delete("/posts/:id/comments/:commentId", requireAuth, requireActive, asyncHandler(posts.deleteComment));
router.delete("/posts/:id/comments/:commentId/like", requireAuth, requireActive, asyncHandler(posts.setCommentLike));
router.post("/posts/:id/comments/:commentId/report", requireAuth, reportLimiter, validate(createReportSchema), requireActive, asyncHandler(reports.createCommentReport));
router.post(
  "/posts/:id/report",
  requireAuth,
  reportLimiter,
  validate(createReportSchema),
  requireActive,
  asyncHandler(reports.createReport),
);

// Admin / moderation
router.get("/admin/comment-reports", ...adminOnly, validate(reportQuerySchema, "query"), asyncHandler(admin.listCommentReports));
router.post("/admin/comment-reports/:id/dismiss", ...adminOnly, asyncHandler(admin.dismissCommentReport));
router.get(
  "/admin/reports",
  ...adminOnly,
  validate(reportQuerySchema, "query"),
  asyncHandler(admin.listReports),
);
router.get("/moderation/notices", requireAuth, asyncHandler(moderation.ownNotices));
router.get("/moderation/reports", ...staff, asyncHandler(moderation.listReports));
router.post("/moderation/reports/:kind/:id", ...staff, asyncHandler(moderation.decideReport));
router.get("/moderation/content", ...staff, asyncHandler(moderation.listContent));
router.get("/moderation/content/:kind/:id/images/:index", ...staff, asyncHandler(moderation.contentImage));
router.post("/moderation/content/:kind/:id", ...staff, asyncHandler(moderation.moderateContent));
router.get("/moderation/users", ...staff, asyncHandler(moderation.listUsers));
router.get("/moderation/users/:id", ...staff, asyncHandler(moderation.getUser));
router.post("/moderation/users/:id/warnings/:warningId/lift", ...staff, asyncHandler(moderation.liftWarning));
router.post("/moderation/users/:id/measures", ...staff, asyncHandler(moderation.applyMeasure));
router.patch("/moderation/users/:id/role", ...adminOnly, asyncHandler(moderation.changeRole));
router.get("/moderation/history", ...staff, asyncHandler(moderation.history));
router.post("/moderation/games", ...staff, validate(gameLinkSchema), asyncHandler(gameCatalog.add));
router.get("/admin/errors", ...adminOnly, asyncHandler(monitor.listErrors));
router.get("/admin/feedback-export/groups", ...adminOnly, asyncHandler(feedbackExport.listFeedbackCommunities));
router.get("/admin/feedback-export/:communityId", ...adminOnly, asyncHandler(feedbackExport.lastFeedbackExport));
router.post("/admin/feedback-export/:communityId", ...adminOnly, asyncHandler(feedbackExport.exportFeedback));
router.get("/admin/telemetry/metrics", ...adminOnly, validate(telemetryQuerySchema, "query"), asyncHandler(monitor.listMetrics));
router.get("/admin/telemetry/network", ...adminOnly, validate(telemetryQuerySchema, "query"), asyncHandler(monitor.listNetwork));
router.post("/admin/errors/:id/resolve", ...adminOnly, asyncHandler(monitor.resolveError));
router.post("/admin/reports/:id/dismiss", ...adminOnly, asyncHandler(admin.dismissReport));
router.post(
  "/admin/reports/:id/resolve",
  ...adminOnly,
  validate(resolveReportSchema),
  asyncHandler(admin.resolveReport),
);
router.post(
  "/admin/users/:username/ban",
  ...adminOnly,
  validate(banUserSchema),
  asyncHandler(admin.banUserByUsername),
);
router.post("/admin/users/:username/unban", ...adminOnly, asyncHandler(admin.unbanUserByUsername));

// News (public: guests see it too) and the Contact form
router.get("/news", publicLimiter, validate(newsQuerySchema, "query"), asyncHandler(news.list));
router.get("/server-fundraiser", publicLimiter, asyncHandler(serverFundraiser.get));
router.get("/development-widget", publicLimiter, asyncHandler(developmentWidget.latest));
router.get("/site-updates", publicLimiter, asyncHandler(developmentWidget.updates));
router.get("/site-content", publicLimiter, asyncHandler(siteContent.getContent));
router.get("/games", publicLimiter, asyncHandler(gameCatalog.list));
router.get("/site-team", publicLimiter, asyncHandler(siteContent.team));
router.get("/online-count", publicLimiter, asyncHandler(async (_req, res) => {
  const { onlineCount } = await import("../services/realtime.js");
  res.json({ count: await onlineCount() });
}));
router.post("/contact", contactLimiter, validate(contactSchema), asyncHandler(contact.send));

// Web Push (notifications when the site is closed)
router.get("/push/status", requireAuth, asyncHandler(push.status));
router.post(
  "/push/subscribe",
  requireAuth,
  pushLimiter,
  validate(pushSubscribeSchema),
  requireActive,
  asyncHandler(push.subscribe),
);
router.post(
  "/push/unsubscribe",
  requireAuth,
  pushLimiter,
  validate(pushUnsubscribeSchema),
  asyncHandler(push.unsubscribe),
);
router.put(
  "/push/preferences",
  requireAuth,
  pushLimiter,
  validate(pushPreferencesSchema),
  asyncHandler(push.savePreferences),
);
router.post("/push/test", requireAuth, testPushLimiter, asyncHandler(push.test));

// Direct messages. Fixed paths ("/messages/unread-count", "/messages/with/:username") come
// before "/messages/:id".
router.get("/messages", requireAuth, asyncHandler(messages.listConversations));
router.get("/messages/unread-count", requireAuth, asyncHandler(messages.unreadCount));
router.post("/messages/images", requireAuth, uploadLimiter, parseImageUpload, requireActive, asyncHandler(messages.uploadImage));
router.get("/messages/images/:imageId", requireAuth, asyncHandler(messages.imageUrl));
router.post(
  "/messages/with/:username",
  requireAuth,
  validate(sendMessageSchema),
  requireActive,
  accountActionLimiter("message"),
  asyncHandler(messages.start),
);
router.get(
  "/messages/:id",
  requireAuth,
  validate(messagesQuerySchema, "query"),
  asyncHandler(messages.getMessages),
);
// After /messages/with/:username, so a user named "read" can still be messaged.
router.post("/messages/:id/read", requireAuth, readLimiter, asyncHandler(messages.markRead));
router.patch("/messages/:id/items/:messageId", requireAuth, requireActive, validate(editMessageSchema), asyncHandler(messages.editMessage));
router.delete("/messages/:id/items/:messageId", requireAuth, requireActive, asyncHandler(messages.deleteMessage));
router.post(
  "/messages/:id",
  requireAuth,
  validate(sendMessageSchema),
  requireActive,
  accountActionLimiter("message"),
  asyncHandler(messages.send),
);
