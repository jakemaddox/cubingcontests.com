import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const withMDX = createMDX({});

const nextConfig: NextConfig = withMDX({
  output: "standalone",
  serverExternalPackages: ["cubing", "geo-tz", "pino", "pino-logflare"],
  pageExtensions: ["md", "mdx", "tsx", "ts", "jsx", "js", "mjs", "json"],
  redirects() {
    return Promise.resolve([
      {
        source: "/records",
        destination: "/records/unofficial",
        permanent: true,
      },
      {
        source: "/rankings",
        destination: "/rankings/fto/single",
        permanent: true,
      },
      {
        source: "/moderator-instructions",
        destination: "/moderator-instructions/wca",
        permanent: true,
      },
    ]);
  },
  // Enables streaming (https://nextjs.org/docs/app/guides/self-hosting#streaming-and-suspense)
  async headers() {
    return [
      {
        source: "/:path*{/}?",
        headers: [
          {
            key: "X-Accel-Buffering",
            value: "no",
          },
        ],
      },
    ];
  },
});

export default nextConfig;
