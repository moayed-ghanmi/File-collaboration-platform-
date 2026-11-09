import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { Card } from "@/components/ui";

export const metadata = { title: "Dashboard · FileCollab" };

async function Welcome() {
  const { user } = await requireSession();
  return <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>;
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="h-8 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />}>
        <Welcome />
      </Suspense>
      <Card title="Your files" description="Teams, folders and uploads arrive in the next phases.">
        <p className="text-sm text-zinc-500">Nothing here yet.</p>
      </Card>
    </div>
  );
}
