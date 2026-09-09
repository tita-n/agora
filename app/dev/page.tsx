import { requireRole } from "@/lib/auth";
import Link from "next/link";

export default async function DevPage() {
  const user = await requireRole(["developer", "admin"]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-3xl font-bold text-gray-900">
        Welcome, {user.email}
      </h1>
      <p className="mt-2 text-gray-500">Developer portal</p>
      <Link
        href="/"
        className="mt-6 text-sm text-gray-500 hover:text-gray-900"
      >
        &larr; Back to Agora
      </Link>
    </main>
  );
}