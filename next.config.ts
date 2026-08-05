import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable Next.js 16 Cache Components so the `use cache` directive,
  // `cacheTag`/`revalidateTag`, and route prerendering are available.
  // Routes that read cookies()/headers()/searchParams (dashboard layout,
  // customer access gate, /qr/[token]) automatically become dynamic holes
  // that stream behind <Suspense>; everything else is prerendered.
  cacheComponents: true,
  images: {
    // Supabase Storage public URLs: https://<project-ref>.supabase.co/storage/v1/object/public/...
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
};

export default nextConfig;
