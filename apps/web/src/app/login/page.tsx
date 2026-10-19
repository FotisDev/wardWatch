import { signIn, signUp } from "./actions";

const input =
  "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700";
const button = "flex-1 rounded-md px-3 py-2 text-sm font-medium";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="text-2xl font-bold">WardWatch</h1>
      <p className="mt-1 text-sm text-neutral-500">Sign in to see your ward.</p>

      {error && (
        <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {message && (
        <p className="mt-4 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {message}
        </p>
      )}

      <form className="mt-6 space-y-3">
        <input name="full_name" placeholder="Full name (sign-up only)" className={input} />
        <input name="email" type="email" required placeholder="Email" autoComplete="email" className={input} />
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="Password"
          autoComplete="current-password"
          className={input}
        />
        <div className="flex gap-2 pt-1">
          <button formAction={signIn} className={`${button} bg-neutral-900 text-white dark:bg-white dark:text-black`}>
            Sign in
          </button>
          <button formAction={signUp} className={`${button} border border-neutral-300 dark:border-neutral-700`}>
            Create account
          </button>
        </div>
      </form>
    </main>
  );
}
