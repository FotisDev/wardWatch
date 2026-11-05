import Link from "next/link";
import type { Ward } from "@/lib/session";
import { signOut } from "./login/actions";
import { PushToggle } from "./push-toggle";

const pages = [
  { href: "/", label: "Board" },
  { href: "/handover", label: "Handover" },
  { href: "/audit", label: "Audit log" },
];

export function AppHeader({
  me,
  wards,
  ward,
  path,
}: {
  me: { full_name: string | null; role: string };
  wards: Ward[];
  ward: Ward | null;
  path: string;
}) {
  const withWard = (href: string, code = ward?.code) => (code ? `${href}?ward=${code}` : href);
  const pill = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm ${
      active ? "bg-neutral-900 text-white dark:bg-white dark:text-black" : "border border-neutral-300 dark:border-neutral-700"
    }`;

  return (
    <header className="space-y-3 border-b border-neutral-200 pb-4 print:hidden dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">WardWatch</h1>
          <p className="text-sm text-neutral-500">
            {me.full_name ?? "Signed in"} · {me.role.replace("_", " ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PushToggle />
          <form action={signOut}>
            <button className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-foreground">Sign out</button>
          </form>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex gap-1">
          {pages.map((p) => (
            <Link
              key={p.href}
              href={withWard(p.href)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                p.href === path ? "font-semibold" : "text-neutral-500 hover:text-foreground"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        {wards.length > 1 && (
          <div className="flex gap-2">
            {wards.map((w) => (
              <Link key={w.id} href={withWard(path, w.code)} className={pill(w.id === ward?.id)}>
                {w.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

export function NoWard({ userId }: { userId: string }) {
  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">No ward assigned yet</h2>
      <p className="mt-2 text-sm text-neutral-500">
        An admin needs to give you a ward or the admin role. To make yourself admin, run this in the Supabase SQL
        editor:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
        {`update public.profiles set role = 'admin' where id = '${userId}';`}
      </pre>
    </>
  );
}
