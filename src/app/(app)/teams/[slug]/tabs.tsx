import Link from "next/link";

export function TeamTabs({ slug, active }: { slug: string; active: "files" | "members" }) {
  const tab = (href: string, label: string, isActive: boolean) => (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`border-b-2 px-1 pb-2 text-sm font-medium ${isActive ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex gap-6 border-b border-zinc-200 dark:border-zinc-800" aria-label="Team sections">
      {tab(`/teams/${slug}/files`, "Files", active === "files")}
      {tab(`/teams/${slug}`, "Members & settings", active === "members")}
    </nav>
  );
}
