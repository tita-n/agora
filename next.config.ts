import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Real Vercel Blob URLs are <store-prefix>.public.blob.vercel-storage.com
      // — the exact hostname "public.blob.vercel-storage.com" never matches (M-10).
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;