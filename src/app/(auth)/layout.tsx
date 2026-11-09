import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <Link href="/" className="mb-8 text-xl font-semibold">
        FileCollab
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {children}
      </div>
    </div>
  );
}
