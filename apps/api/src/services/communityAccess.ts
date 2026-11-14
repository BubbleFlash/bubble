import { communityRoleSchema, DEFAULT_COMMUNITY_PERMISSIONS } from "@commune/shared";
import type { CommunityPermissions, CommunityRole } from "@commune/shared";
import type { Types } from "mongoose";
import { Membership } from "../models/Membership.js";

type ManagerRole = "admin" | "editor";
export interface CommunityAccess {
  _id: Types.ObjectId;
  creator?: Types.ObjectId;
  managers?: Readonly<Record<string, ManagerRole>> | ReadonlyMap<string, ManagerRole> | null;
  permissions?: { [K in keyof CommunityPermissions]?: CommunityPermissions[K] | null } | null;
  departingMemberships?: Types.ObjectId[] | null;
}

export function communityPermissions(community: CommunityAccess): CommunityPermissions {
  return {
    publish: community.permissions?.publish ?? DEFAULT_COMMUNITY_PERMISSIONS.publish,
    managePosts: community.permissions?.managePosts ?? DEFAULT_COMMUNITY_PERMISSIONS.managePosts,
    editAppearance: community.permissions?.editAppearance ?? DEFAULT_COMMUNITY_PERMISSIONS.editAppearance,
  };
}

export function meetsCommunityRole(role: CommunityRole | null, minimum: CommunityRole) {
  return role !== null && communityRoleSchema.options.indexOf(role) >= communityRoleSchema.options.indexOf(minimum);
}

export function communityRole(community: CommunityAccess, userId: string, membershipId?: Types.ObjectId) {
  if (community.creator?.equals(userId)) return "owner";
  if (!membershipId || community.departingMemberships?.some((id) => id.equals(membershipId))) return null;
  const key = String(membershipId);
  const managers = community.managers;
  const granted = managers instanceof Map
    ? managers.get(key)
    : (managers as Readonly<Record<string, ManagerRole>> | null | undefined)?.[key];
  return granted ?? "member";
}

export async function communityMembership(community: CommunityAccess, userId: string) {
  const membership = community.creator?.equals(userId)
    ? null
    : await Membership.findOne({ community: community._id, user: userId }).select("_id").lean();
  return { role: communityRole(community, userId, membership?._id), membershipId: membership?._id };
}

export function canManageCommunityPost(community: CommunityAccess, role: CommunityRole | null, isAuthor: boolean) {
  return meetsCommunityRole(role, communityPermissions(community).managePosts)
    && (isAuthor || meetsCommunityRole(role, "editor"));
}
