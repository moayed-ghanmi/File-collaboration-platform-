import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold">FileCollab</span>
          <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <a href="/api/health">Status</a>
            <Link href="/sign-in">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-6 py-24">
        <h1 className="text-4xl font-semibold tracking-tight">
          Share files with your team, in real time.
        </h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Upload, organize and co-edit files together. Changes sync instantly
          across everyone on your team.
        </p>
        <div className="flex gap-3">
          <Link
            href="/sign-up"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Sign in
          </Link>
        </div>
      </main>
      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
        FileCollab
      </footer>
    </div>
  );
}
