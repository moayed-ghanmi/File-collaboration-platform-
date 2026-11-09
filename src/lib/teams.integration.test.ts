import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { outbox } from "./mail";
import {
  acceptInvitation,
  changeMemberRole,
  createTeam,
  declineInvitation,
  deleteTeam,
  getInvitationByToken,
  getTeamForMember,
  hashToken,
  inviteMember,
  listInvitationsForEmail,
  listTeamsForUser,
  removeMember,
  renameTeam,
  revokeInvitation,
  slugify,
  TeamError,
} from "./teams";

const run = `${Date.now()}`;
const emailFor = (who: string) => `teams-${who}-${run}@example.test`;
type U = { id: string; email: string };
const users: Record<"owner" | "admin" | "member" | "viewer" | "outsider" | "invitee", U> = {} as never;

async function makeUser(who: keyof typeof users) {
  const u = await db().user.create({ data: { name: who, email: emailFor(who), emailVerified: true } });
  users[who] = { id: u.id, email: u.email };
}

function tokenFromLastEmail(to: string): string {
  const mail = outbox.findLast((m) => m.to === to);
  if (!mail) throw new Error(`no email to ${to}`);
  return mail.text.match(/\/invite\/([\w-]+)/)![1];
}

async function invited(teamId: string, who: keyof typeof users, role: "ADMIN" | "MEMBER" | "VIEWER") {
  await inviteMember(users.owner.id, teamId, users[who].email, role);
  await acceptInvitation(users[who], { token: tokenFromLastEmail(users[who].email) });
}

let teamId: string;

beforeAll(async () => {
  for (const who of ["owner", "admin", "member", "viewer", "outsider", "invitee"] as const) await makeUser(who);
  const team = await createTeam(users.owner.id, "Acme Design");
  teamId = team.id;
  await invited(teamId, "admin", "ADMIN");
  await invited(teamId, "member", "MEMBER");
  await invited(teamId, "viewer", "VIEWER");
});

afterAll(async () => {
  await db().team.deleteMany({ where: { memberships: { some: { userId: users.owner.id } } } });
  await db().user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
});

beforeEach(() => {
  outbox.length = 0;
});

describe("slugify", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("  Café Ünïcode & Co!  ")).toBe("cafe-unicode-co");
    expect(slugify("!!!")).toBe("team");
  });
});

describe("teams", () => {
  it("makes the creator the owner and dedupes slugs", async () => {
    const team = await getTeamForMember(users.owner.id, slugify("Acme Design"));
    expect(team?.role).toBe("OWNER");
    const again = await createTeam(users.owner.id, "Acme Design");
    expect(again.slug).not.toBe(team?.slug);
    expect(again.slug).toMatch(/^acme-design-[0-9a-f]{6}$/);
  });

  it("rejects blank names", async () => {
    await expect(createTeam(users.owner.id, "   ")).rejects.toThrow(TeamError);
  });

  it("lists teams with role and member count", async () => {
    const teams = await listTeamsForUser(users.member.id);
    expect(teams).toEqual([expect.objectContaining({ id: teamId, role: "MEMBER", memberCount: 4 })]);
  });

  it("hides the team from non-members and invitations from non-managers", async () => {
    const slug = (await db().team.findUniqueOrThrow({ where: { id: teamId } })).slug;
    expect(await getTeamForMember(users.outsider.id, slug)).toBeNull();
    await inviteMember(users.owner.id, teamId, "pending-" + emailFor("x"), "MEMBER");
    expect((await getTeamForMember(users.member.id, slug))!.invitations).toEqual([]);
    expect((await getTeamForMember(users.admin.id, slug))!.invitations.length).toBeGreaterThan(0);
  });

  it("lets admins rename but not members", async () => {
    await renameTeam(users.admin.id, teamId, "Acme Studio");
    await expect(renameTeam(users.member.id, teamId, "Nope")).rejects.toThrow(/owners and admins/);
    await expect(renameTeam(users.outsider.id, teamId, "Nope")).rejects.toThrow(/not found/);
  });

  it("only lets owners delete a team", async () => {
    const t = await createTeam(users.owner.id, "Temp");
    await invited(t.id, "admin", "ADMIN");
    await expect(deleteTeam(users.admin.id, t.id)).rejects.toThrow(/Only owners/);
    await deleteTeam(users.owner.id, t.id);
    expect(await db().team.findUnique({ where: { id: t.id } })).toBeNull();
  });
});

describe("invitations", () => {
  it("emails a link and stores only a hash of the token", async () => {
    await inviteMember(users.admin.id, teamId, users.invitee.email.toUpperCase(), "VIEWER");
    const token = tokenFromLastEmail(users.invitee.email);
    const row = await db().invitation.findFirstOrThrow({ where: { teamId, email: users.invitee.email } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toContain(token);
    expect((await getInvitationByToken(token))?.team.id).toBe(teamId);
    expect(await listInvitationsForEmail(users.invitee.email)).toHaveLength(1);
  });

  it("re-inviting replaces the old link", async () => {
    await inviteMember(users.owner.id, teamId, users.invitee.email, "VIEWER");
    const first = tokenFromLastEmail(users.invitee.email);
    await inviteMember(users.owner.id, teamId, users.invitee.email, "MEMBER");
    const second = tokenFromLastEmail(users.invitee.email);
    expect(await getInvitationByToken(first)).toBeNull();
    expect((await getInvitationByToken(second))?.role).toBe("MEMBER");
  });

  it("enforces who may invite and with which role", async () => {
    await expect(inviteMember(users.member.id, teamId, "a@example.test", "VIEWER")).rejects.toThrow(/owners and admins/);
    await expect(inviteMember(users.admin.id, teamId, "a@example.test", "ADMIN")).rejects.toThrow(/as admin/);
    await expect(inviteMember(users.admin.id, teamId, "a@example.test", "OWNER")).rejects.toThrow(/as owner/);
    await expect(inviteMember(users.owner.id, teamId, "not-an-email", "MEMBER")).rejects.toThrow(/valid email/);
    await expect(inviteMember(users.owner.id, teamId, users.member.email, "MEMBER")).rejects.toThrow(/already a member/);
  });

  it("only the invited address can accept", async () => {
    await inviteMember(users.owner.id, teamId, users.invitee.email, "MEMBER");
    const token = tokenFromLastEmail(users.invitee.email);
    await expect(acceptInvitation(users.outsider, { token })).rejects.toThrow(/different email/);
    await expect(acceptInvitation(users.invitee, { token: "bogus" })).rejects.toThrow(/invalid or has expired/);
  });

  it("rejects expired invitations", async () => {
    await inviteMember(users.owner.id, teamId, users.invitee.email, "MEMBER");
    const token = tokenFromLastEmail(users.invitee.email);
    await db().invitation.update({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getInvitationByToken(token)).toBeNull();
    await expect(acceptInvitation(users.invitee, { token })).rejects.toThrow(/expired/);
  });

  it("can be declined or revoked", async () => {
    await inviteMember(users.owner.id, teamId, users.invitee.email, "MEMBER");
    await declineInvitation(users.invitee, { token: tokenFromLastEmail(users.invitee.email) });
    expect(await listInvitationsForEmail(users.invitee.email)).toHaveLength(0);

    await inviteMember(users.owner.id, teamId, users.invitee.email, "MEMBER");
    const [inv] = await listInvitationsForEmail(users.invitee.email);
    await expect(revokeInvitation(users.member.id, inv.id)).rejects.toThrow(/owners and admins/);
    await revokeInvitation(users.admin.id, inv.id);
    expect(await listInvitationsForEmail(users.invitee.email)).toHaveLength(0);
  });

  it("accepting adds the member with the invited role and consumes the invitation", async () => {
    await inviteMember(users.owner.id, teamId, users.invitee.email, "VIEWER");
    const [inv] = await listInvitationsForEmail(users.invitee.email);
    const slug = await acceptInvitation(users.invitee, { id: inv.id });
    const team = await getTeamForMember(users.invitee.id, slug);
    expect(team?.role).toBe("VIEWER");
    await expect(acceptInvitation(users.invitee, { id: inv.id })).rejects.toThrow(/invalid/);
  });
});

describe("member management", () => {
  it("admins manage members and viewers only, and can't grant admin", async () => {
    await changeMemberRole(users.admin.id, teamId, users.invitee.id, "MEMBER");
    await expect(changeMemberRole(users.admin.id, teamId, users.invitee.id, "ADMIN")).rejects.toThrow(/permission/);
    await expect(changeMemberRole(users.admin.id, teamId, users.owner.id, "MEMBER")).rejects.toThrow(/permission/);
    await expect(changeMemberRole(users.member.id, teamId, users.viewer.id, "MEMBER")).rejects.toThrow(/permission/);
    await expect(changeMemberRole(users.admin.id, teamId, users.admin.id, "MEMBER")).rejects.toThrow(/your own role/);
    await expect(removeMember(users.admin.id, teamId, users.owner.id)).rejects.toThrow(/permission/);
  });

  it("never leaves a team without an owner", async () => {
    await expect(changeMemberRole(users.owner.id, teamId, users.owner.id, "ADMIN")).rejects.toThrow(/needs an owner/);
    await expect(removeMember(users.owner.id, teamId, users.owner.id)).rejects.toThrow(/only owner/);

    await changeMemberRole(users.owner.id, teamId, users.admin.id, "OWNER");
    await changeMemberRole(users.owner.id, teamId, users.owner.id, "ADMIN"); // now allowed
    await expect(changeMemberRole(users.admin.id, teamId, users.admin.id, "MEMBER")).rejects.toThrow(/needs an owner/);
    await changeMemberRole(users.admin.id, teamId, users.owner.id, "OWNER"); // restore
    await changeMemberRole(users.owner.id, teamId, users.admin.id, "ADMIN");
  });

  it("members can leave and be removed", async () => {
    await removeMember(users.invitee.id, teamId, users.invitee.id);
    expect(await getTeamForMember(users.invitee.id, (await db().team.findUniqueOrThrow({ where: { id: teamId } })).slug)).toBeNull();
    await removeMember(users.admin.id, teamId, users.viewer.id);
    const members = await db().membership.findMany({ where: { teamId } });
    expect(members.map((m) => m.userId).sort()).toEqual([users.owner.id, users.admin.id, users.member.id].sort());
  });
});
