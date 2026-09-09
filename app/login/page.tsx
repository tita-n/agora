export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Sign in</h1>
        <form action="/api/auth/signin/credentials" method="POST" className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Sign in
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-gray-400">
          Test accounts: dev@agora.test / password123 · owner@agora.test / password123
        </p>
      </div>
    </main>
  );
}

export const metadata = { title: "Sign in — Agora" };