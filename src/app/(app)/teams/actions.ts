"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { isRole } from "@/lib/roles";
import * as teams from "@/lib/teams";
import type { ActionState } from "@/components/action-form";

// Every action re-checks the session; the service layer enforces team permissions.

const field = (form: FormData, key: string) => String(form.get(key) ?? "");

async function attempt(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const success = await fn();
    refresh();
    return success ? { success } : null;
  } catch (e) {
    if (e instanceof teams.TeamError) return { error: e.message };
    throw e;
  }
}

function invitationRef(form: FormData) {
  const token = field(form, "token");
  return token ? { token } : { id: field(form, "invitationId") };
}

export async function createTeamAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  let slug: string;
  try {
    slug = (await teams.createTeam(user.id, form.get("name"))).slug;
  } catch (e) {
    if (e instanceof teams.TeamError) return { error: e.message };
    throw e;
  }
  redirect(`/teams/${slug}`);
}

export async function renameTeamAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  return attempt(async () => {
    await teams.renameTeam(user.id, field(form, "teamId"), form.get("name"));
    return "Team renamed.";
  });
}

export async function deleteTeamAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const result = await attempt(() => teams.deleteTeam(user.id, field(form, "teamId")));
  if (result?.error) return result;
  redirect("/dashboard");
}

export async function inviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const role = field(form, "role");
  if (!isRole(role)) return { error: "Choose a role." };
  return attempt(async () => {
    const { email } = await teams.inviteMember(user.id, field(form, "teamId"), form.get("email"), role);
    return `Invitation sent to ${email}.`;
  });
}

export async function revokeInvitationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  return attempt(() => teams.revokeInvitation(user.id, field(form, "invitationId")));
}

export async function acceptInvitationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  let slug: string;
  try {
    slug = await teams.acceptInvitation(user, invitationRef(form));
  } catch (e) {
    if (e instanceof teams.TeamError) return { error: e.message };
    throw e;
  }
  redirect(`/teams/${slug}`);
}

export async function declineInvitationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const ref = invitationRef(form);
  const result = await attempt(() => teams.declineInvitation(user, ref));
  if (result?.error || !("token" in ref)) return result;
  redirect("/dashboard");
}

export async function changeRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const role = field(form, "role");
  if (!isRole(role)) return { error: "Choose a role." };
  return attempt(() => teams.changeMemberRole(user.id, field(form, "teamId"), field(form, "userId"), role));
}

export async function removeMemberAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const target = field(form, "userId");
  const result = await attempt(() => teams.removeMember(user.id, field(form, "teamId"), target));
  if (result?.error || target !== user.id) return result;
  redirect("/dashboard"); // left the team
}
