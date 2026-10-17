export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-2xl font-bold text-ink">Access Denied</h1>
      <p className="mt-2 text-ink-muted">You don&apos;t have permission to access this page.</p>
    </main>
  );
}

export const metadata = { title: "Access Denied — Agora" };