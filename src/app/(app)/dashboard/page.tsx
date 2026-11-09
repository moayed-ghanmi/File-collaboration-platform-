import { Suspense } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listInvitationsForEmail, listTeamsForUser } from "@/lib/teams";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { Card, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { acceptInvitationAction, createTeamAction, declineInvitationAction } from "../teams/actions";

export const metadata = { title: "Dashboard · FileCollab" };

async function Welcome() {
  const { user } = await requireSession();
  return <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>;
}

async function PendingInvitations() {
  const { user } = await requireSession();
  const invitations = await listInvitationsForEmail(user.email);
  if (invitations.length === 0) return null;
  return (
    <Card title="Invitations" description="Teams that want you to join.">
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {invitations.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="pending-invitation">
            <p className="text-sm">
              <strong className="font-medium">{i.invitedBy.name}</strong> invited you to{" "}
              <strong className="font-medium">{i.team.name}</strong> as {ROLE_LABEL[i.role as Role].toLowerCase()}
            </p>
            <div className="flex gap-2">
              <ActionForm action={acceptInvitationAction}>
                <input type="hidden" name="invitationId" value={i.id} />
                <SubmitButton size="sm">Accept</SubmitButton>
              </ActionForm>
              <ActionForm action={declineInvitationAction}>
                <input type="hidden" name="invitationId" value={i.id} />
                <SubmitButton variant="secondary" size="sm">
                  Decline
                </SubmitButton>
              </ActionForm>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function Teams() {
  const { user } = await requireSession();
  const teams = await listTeamsForUser(user.id);
  return teams.length === 0 ? (
    <p className="text-sm text-zinc-500">You&apos;re not in any team yet. Create one below or ask a teammate to invite you.</p>
  ) : (
    <ul className="grid gap-3 sm:grid-cols-2">
      {teams.map((t) => (
        <li key={t.id}>
          <Link
            href={`/teams/${t.slug}`}
            className="block rounded-md border border-zinc-200 p-4 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <p className="font-medium">{t.name}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {ROLE_LABEL[t.role]} · {t.memberCount} {t.memberCount === 1 ? "member" : "members"}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="h-8 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />}>
        <Welcome />
      </Suspense>
      <Suspense>
        <PendingInvitations />
      </Suspense>
      <Card title="Your teams" description="Files and folders will live inside teams.">
        <Suspense fallback={<div className="h-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />}>
          <Teams />
        </Suspense>
        <ActionForm action={createTeamAction} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="New team name" name="name" required maxLength={60} placeholder="e.g. Design" />
          </div>
          <SubmitButton pendingText="Creating…">Create team</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
