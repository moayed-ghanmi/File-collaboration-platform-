import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { invitationEmail } from "./emails";
import { deletePrefix } from "./storage";
import { teamStoragePrefix } from "./files";
import { assignableRoles, canManageMember, canManageTeam, ROLE_LABEL, type Role } from "./roles";

/** Expected, user-facing failure (permission, validation, not found). */
export class TeamError extends Error {
  name = "TeamError";
}

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "team";
}

function teamName(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (name.length < 1 || name.length > 60) throw new TeamError("Team name must be 1–60 characters.");
  return name;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

async function membershipOf(userId: string, teamId: string, client: Prisma.TransactionClient = db()) {
  const m = await client.membership.findUnique({ where: { userId_teamId: { userId, teamId } } });
  if (!m) throw new TeamError("Team not found.");
  return m;
}

// Role changes and removals check "is there another owner?" and then write, so
// they run serializably to stop two owners demoting each other at once.
async function serializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await db().$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      throw new TeamError("Someone else changed this team at the same time. Please try again.");
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Teams

export async function createTeam(userId: string, rawName: unknown) {
  const name = teamName(rawName);
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    try {
      return await db().team.create({
        data: { name, slug, memberships: { create: { userId, role: "OWNER" } } },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new TeamError("Couldn't create the team. Please try again.");
}

export async function listTeamsForUser(userId: string) {
  const memberships = await db().membership.findMany({
    where: { userId },
    include: { team: { include: { _count: { select: { memberships: true } } } } },
    orderBy: { team: { name: "asc" } },
  });
  return memberships.map((m) => ({
    id: m.team.id,
    name: m.team.name,
    slug: m.team.slug,
    role: m.role as Role,
    memberCount: m.team._count.memberships,
  }));
}

/** Everything the team page needs, or null when the user isn't a member. */
export async function getTeamForMember(userId: string, slug: string) {
  const team = await db().team.findUnique({
    where: { slug },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      invitations: { orderBy: { createdAt: "asc" } },
    },
  });
  const me = team?.memberships.find((m) => m.userId === userId);
  if (!team || !me) return null;
  const role = me.role as Role;
  const now = Date.now();
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    role,
    members: team.memberships.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role as Role,
      joinedAt: m.createdAt,
    })),
    // Only managers see who has been invited.
    invitations: canManageTeam(role)
      ? team.invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role as Role,
          expiresAt: i.expiresAt,
          expired: i.expiresAt.getTime() <= now,
        }))
      : [],
  };
}

export async function renameTeam(actorId: string, teamId: string, rawName: unknown) {
  const name = teamName(rawName);
  const me = await membershipOf(actorId, teamId);
  if (!canManageTeam(me.role)) throw new TeamError("Only owners and admins can rename the team.");
  await db().team.update({ where: { id: teamId }, data: { name } });
}

export async function deleteTeam(actorId: string, teamId: string) {
  const me = await membershipOf(actorId, teamId);
  if (me.role !== "OWNER") throw new TeamError("Only owners can delete the team.");
  await db().team.delete({ where: { id: teamId } });
  // After the rows are gone, so a storage failure can't leave a half-deleted team.
  await deletePrefix(teamStoragePrefix(teamId)).catch((e) => console.error("[storage] team cleanup failed", teamId, e));
}

// ---------------------------------------------------------------------------
// Invitations

const emailSchema = z.email();

export async function inviteMember(actorId: string, teamId: string, rawEmail: unknown, role: Role) {
  const parsed = emailSchema.safeParse(String(rawEmail ?? "").trim().toLowerCase());
  if (!parsed.success) throw new TeamError("Enter a valid email address.");
  const email = parsed.data;

  const me = await membershipOf(actorId, teamId);
  if (!canManageTeam(me.role)) throw new TeamError("Only owners and admins can invite people.");
  if (!assignableRoles(me.role).includes(role)) {
    throw new TeamError(`You can't invite someone as ${ROLE_LABEL[role].toLowerCase()}.`);
  }
  const existing = await db().membership.findFirst({
    where: { teamId, user: { email: { equals: email, mode: "insensitive" } } },
  });
  if (existing) throw new TeamError(`${email} is already a member of this team.`);

  // Re-inviting the same address replaces the old link.
  const token = randomBytes(32).toString("base64url");
  const data = { role, tokenHash: hashToken(token), invitedById: actorId, expiresAt: new Date(Date.now() + INVITATION_TTL_MS) };
  const invitation = await db().invitation.upsert({
    where: { teamId_email: { teamId, email } },
    create: { teamId, email, ...data },
    update: data,
    include: { team: true, invitedBy: true },
  });

  const url = `${env().BETTER_AUTH_URL}/invite/${token}`;
  await sendMail(invitationEmail(email, invitation.invitedBy.name, invitation.team.name, ROLE_LABEL[role], url));
  return { email };
}

export async function revokeInvitation(actorId: string, invitationId: string) {
  const invitation = await db().invitation.findUnique({ where: { id: invitationId } });
  if (!invitation) throw new TeamError("Invitation not found.");
  const me = await membershipOf(actorId, invitation.teamId);
  if (!canManageTeam(me.role)) throw new TeamError("Only owners and admins can revoke invitations.");
  await db().invitation.deleteMany({ where: { id: invitationId } });
}

const invitationInclude = {
  team: { select: { id: true, name: true, slug: true } },
  invitedBy: { select: { name: true } },
} satisfies Prisma.InvitationInclude;

/** A still-valid invitation for the emailed token, or null. */
export async function getInvitationByToken(token: string) {
  const invitation = await db().invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: invitationInclude,
  });
  if (!invitation || invitation.expiresAt.getTime() <= Date.now()) return null;
  return invitation;
}

export async function listInvitationsForEmail(email: string) {
  return db().invitation.findMany({
    where: { email: email.toLowerCase(), expiresAt: { gt: new Date() } },
    include: invitationInclude,
    orderBy: { createdAt: "desc" },
  });
}

type Invitee = { id: string; email: string };

async function findForInvitee(user: Invitee, where: Prisma.InvitationWhereUniqueInput) {
  const invitation = await db().invitation.findUnique({ where, include: invitationInclude });
  if (!invitation || invitation.expiresAt.getTime() <= Date.now()) {
    throw new TeamError("This invitation is invalid or has expired.");
  }
  if (invitation.email !== user.email.toLowerCase()) {
    throw new TeamError("This invitation was sent to a different email address.");
  }
  return invitation;
}

/** Accept by emailed token (`{ tokenHash }` lookup) or by id from the dashboard. Returns the team slug. */
export async function acceptInvitation(user: Invitee, ref: { token: string } | { id: string }) {
  const invitation = await findForInvitee(user, "token" in ref ? { tokenHash: hashToken(ref.token) } : { id: ref.id });
  await db().$transaction([
    db().membership.upsert({
      where: { userId_teamId: { userId: user.id, teamId: invitation.teamId } },
      create: { userId: user.id, teamId: invitation.teamId, role: invitation.role },
      update: {}, // already a member: keep the current role
    }),
    db().invitation.deleteMany({ where: { id: invitation.id } }),
  ]);
  return invitation.team.slug;
}

export async function declineInvitation(user: Invitee, ref: { token: string } | { id: string }) {
  const invitation = await findForInvitee(user, "token" in ref ? { tokenHash: hashToken(ref.token) } : { id: ref.id });
  await db().invitation.deleteMany({ where: { id: invitation.id } });
}

// ---------------------------------------------------------------------------
// Members

const LAST_OWNER = "Every team needs an owner. Make someone else an owner first.";

export async function changeMemberRole(actorId: string, teamId: string, targetUserId: string, role: Role) {
  await serializable(async (tx) => {
    const me = await membershipOf(actorId, teamId, tx);
    const target = await tx.membership.findUnique({ where: { userId_teamId: { userId: targetUserId, teamId } } });
    if (!target) throw new TeamError("That person isn't a member of this team.");
    if (target.role === role) return;

    if (actorId === targetUserId) {
      if (me.role !== "OWNER") throw new TeamError("You can't change your own role.");
    } else if (!canManageMember(me.role, target.role) || !assignableRoles(me.role).includes(role)) {
      throw new TeamError("You don't have permission to make that change.");
    }
    if (target.role === "OWNER" && (await tx.membership.count({ where: { teamId, role: "OWNER" } })) < 2) {
      throw new TeamError(LAST_OWNER);
    }
    await tx.membership.update({ where: { id: target.id }, data: { role } });
  });
}

/** Removes another member, or leaves the team when `targetUserId` is the actor. */
export async function removeMember(actorId: string, teamId: string, targetUserId: string) {
  await serializable(async (tx) => {
    const me = await membershipOf(actorId, teamId, tx);
    const target =
      actorId === targetUserId
        ? me
        : await tx.membership.findUnique({ where: { userId_teamId: { userId: targetUserId, teamId } } });
    if (!target) throw new TeamError("That person isn't a member of this team.");
    if (actorId !== targetUserId && !canManageMember(me.role, target.role)) {
      throw new TeamError("You don't have permission to remove this member.");
    }
    if (target.role === "OWNER" && (await tx.membership.count({ where: { teamId, role: "OWNER" } })) < 2) {
      throw new TeamError(
        actorId === targetUserId
          ? "You're the only owner. Make someone else an owner or delete the team before leaving."
          : LAST_OWNER,
      );
    }
    await tx.membership.delete({ where: { id: target.id } });
  });
}
