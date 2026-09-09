import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-5xl font-bold tracking-tight text-gray-900">
        Agora
      </h1>
      <p className="mt-4 max-w-xl text-lg text-gray-500">
        A marketplace where small businesses subscribe to website themes
        built by developers and get a live business website on a subdomain
        instantly — no upfront build fee.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
        >
          Sign in
        </Link>
        <Link
          href="/dev"
          className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
        >
          Developer portal
        </Link>
      </div>
      <p className="mt-10 text-xs text-gray-400">
        Phase 0 placeholder — structural skeleton only.
      </p>
    </main>
  );
}