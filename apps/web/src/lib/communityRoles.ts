import type { CommunityRole } from "@commune/shared";

export const COMMUNITY_ROLES: Record<CommunityRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  editor: "Редактор",
  member: "Участник",
};
