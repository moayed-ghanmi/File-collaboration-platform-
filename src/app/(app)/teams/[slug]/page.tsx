import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getTeamForMember } from "@/lib/teams";
import { assignableRoles, canManageMember, canManageTeam, ROLE_DESCRIPTION, ROLE_LABEL, ROLES } from "@/lib/roles";
import { Card, Field } from "@/components/ui";
import { ActionForm, AutoSubmitSelect, Select, SubmitButton } from "@/components/action-form";
import {
  changeRoleAction,
  deleteTeamAction,
  inviteAction,
  removeMemberAction,
  renameTeamAction,
  revokeInvitationAction,
} from "../actions";

export const metadata = { title: "Team · FileCollab" };

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

async function Team({ params }: { params: PageProps<"/teams/[slug]">["params"] }) {
  const { slug } = await params;
  const { user } = await requireSession();
  const team = await getTeamForMember(user.id, slug);
  if (!team) notFound();

  const manager = canManageTeam(team.role);
  const roleOptions = (roles: readonly (typeof ROLES)[number][]) => roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← All teams
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{team.name}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400" data-testid="my-role">
          You&apos;re {team.role === "ADMIN" || team.role === "OWNER" ? "an" : "a"} {ROLE_LABEL[team.role].toLowerCase()}{" "}
          of this team · {team.members.length} {team.members.length === 1 ? "member" : "members"}
        </p>
      </div>

      <Card title="Members">
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {team.members.map((m) => {
            const self = m.userId === user.id;
            const editable = self ? team.role === "OWNER" : canManageMember(team.role, m.role);
            return (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="member-row">
                <div>
                  <p className="text-sm font-medium">
                    {m.name} {self && <span className="text-zinc-500">(you)</span>}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {m.email} · joined {dateFmt.format(m.joinedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {editable ? (
                    <ActionForm action={changeRoleAction} className="flex items-center gap-2">
                      {hidden("teamId", team.id)}
                      {hidden("userId", m.userId)}
                      <AutoSubmitSelect
                        name="role"
                        label={`Role for ${m.name}`}
                        defaultValue={m.role}
                        options={roleOptions(assignableRoles(team.role))}
                      />
                    </ActionForm>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium dark:bg-zinc-800">
                      {ROLE_LABEL[m.role]}
                    </span>
                  )}
                  {!self && canManageMember(team.role, m.role) && (
                    <ActionForm action={removeMemberAction} confirm={`Remove ${m.name} from ${team.name}?`}>
                      {hidden("teamId", team.id)}
                      {hidden("userId", m.userId)}
                      <SubmitButton variant="danger" className="px-2.5 py-1 text-xs">
                        Remove
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {manager && (
        <Card title="Invite people" description="They'll get an email with a link that's valid for 7 days.">
          <ActionForm action={inviteAction} className="flex flex-col gap-4">
            {hidden("teamId", team.id)}
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
              <Field label="Email address" name="email" type="email" required autoComplete="off" />
              <Select name="role" label="Role" defaultValue="MEMBER" options={roleOptions(assignableRoles(team.role))} />
            </div>
            <ul className="text-xs text-zinc-500">
              {assignableRoles(team.role).map((r) => (
                <li key={r}>
                  <strong className="font-medium">{ROLE_LABEL[r]}:</strong> {ROLE_DESCRIPTION[r]}
                </li>
              ))}
            </ul>
            <div>
              <SubmitButton pendingText="Sending…">Send invitation</SubmitButton>
            </div>
          </ActionForm>

          {team.invitations.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Pending invitations</h3>
              <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
                {team.invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2" data-testid="invitation-row">
                    <p className="text-sm">
                      {i.email} <span className="text-zinc-500">· {ROLE_LABEL[i.role]}</span>{" "}
                      {i.expired ? (
                        <span className="text-xs text-red-600">expired</span>
                      ) : (
                        <span className="text-xs text-zinc-500">expires {dateFmt.format(i.expiresAt)}</span>
                      )}
                    </p>
                    <ActionForm action={revokeInvitationAction}>
                      {hidden("invitationId", i.id)}
                      <SubmitButton variant="secondary" className="px-2.5 py-1 text-xs">
                        Revoke
                      </SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {manager && (
        <Card title="Team settings">
          <ActionForm action={renameTeamAction} className="flex flex-col gap-4">
            {hidden("teamId", team.id)}
            <Field label="Team name" name="name" defaultValue={team.name} required maxLength={60} />
            <div>
              <SubmitButton pendingText="Saving…">Save</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}

      <Card title="Danger zone">
        <div className="flex flex-col gap-4">
          <ActionForm action={removeMemberAction} confirm={`Leave ${team.name}?`} className="flex flex-col gap-2">
            {hidden("teamId", team.id)}
            {hidden("userId", user.id)}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">You&apos;ll lose access until someone invites you again.</p>
            <div>
              <SubmitButton variant="danger">Leave team</SubmitButton>
            </div>
          </ActionForm>
          {team.role === "OWNER" && (
            <ActionForm
              action={deleteTeamAction}
              confirm={`Delete ${team.name} for everyone? This can't be undone.`}
              className="flex flex-col gap-2"
            >
              {hidden("teamId", team.id)}
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Deleting the team removes every member and pending invitation.
              </p>
              <div>
                <SubmitButton variant="danger">Delete team</SubmitButton>
              </div>
            </ActionForm>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function TeamPage({ params }: PageProps<"/teams/[slug]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-900" />}>
        <Team params={params} />
      </Suspense>
    </div>
  );
}
