import Link from "next/link";

/**
 * Rendered when a tenant subdomain resolves to no business (notFound())
 * (finding M-12) — kept tenant-scoped so unknown tenants never see the
 * main app's chrome or navigation.
 */
export default function SiteNotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-2xl font-bold text-gray-900">Site not found</h1>
      <p className="mt-2 text-gray-500">
        This address does not point to a live Agora site (yet).
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
      >
        Back to Agora
      </Link>
    </main>
  );
}
