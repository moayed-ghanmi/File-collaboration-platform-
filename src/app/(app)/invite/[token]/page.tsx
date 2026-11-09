import { Suspense } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getInvitationByToken } from "@/lib/teams";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { Card } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SignOutButton } from "@/components/sign-out-button";
import { acceptInvitationAction, declineInvitationAction } from "../../teams/actions";

export const metadata = { title: "Invitation · FileCollab" };

async function Invitation({ params }: { params: PageProps<"/invite/[token]">["params"] }) {
  const { token } = await params;
  const { user } = await requireSession();
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <Card title="Invitation not available">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This invitation link is invalid, has expired, or was already used. Ask a team admin to send a new one.
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium underline">
          Go to dashboard
        </Link>
      </Card>
    );
  }

  if (invitation.email !== user.email.toLowerCase()) {
    return (
      <Card title="Wrong account">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This invitation was sent to <strong>{invitation.email}</strong>, but you&apos;re signed in as{" "}
          <strong>{user.email}</strong>. Sign out, then open the link again and sign in with the invited address.
        </p>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </Card>
    );
  }

  return (
    <Card title={`Join ${invitation.team.name}`}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {invitation.invitedBy.name} invited you to join <strong>{invitation.team.name}</strong> as{" "}
        {ROLE_LABEL[invitation.role as Role].toLowerCase()}.
      </p>
      <div className="mt-5 flex gap-3">
        <ActionForm action={acceptInvitationAction}>
          <input type="hidden" name="token" value={token} />
          <SubmitButton pendingText="Joining…">Accept invitation</SubmitButton>
        </ActionForm>
        <ActionForm action={declineInvitationAction}>
          <input type="hidden" name="token" value={token} />
          <SubmitButton variant="secondary">Decline</SubmitButton>
        </ActionForm>
      </div>
    </Card>
  );
}

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <div className="mx-auto max-w-lg">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-900" />}>
        <Invitation params={params} />
      </Suspense>
    </div>
  );
}
