// Shared by server and client code, so it must not import the Prisma client.
export const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: "Full control, including deleting the team",
  ADMIN: "Invite and manage members and viewers",
  MEMBER: "Collaborate on files",
  VIEWER: "Read-only access",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Invite people, revoke invitations and rename the team. */
export function canManageTeam(role: Role): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Roles `actor` may grant through an invitation or role change. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "OWNER") return [...ROLES];
  if (actor === "ADMIN") return ["MEMBER", "VIEWER"];
  return [];
}

/** Whether `actor` may change the role of, or remove, another member holding `target`. */
export function canManageMember(actor: Role, target: Role): boolean {
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return target === "MEMBER" || target === "VIEWER";
  return false;
}
