import type { NextConfig } from "next";

const pages = process.env.GITHUB_PAGES === "true";
const basePath = "/json-na-lentu";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(pages
    ? {
        output: "export",
        basePath,
        assetPrefix: basePath,
        trailingSlash: true,
        distDir: ".next-pages",
      }
    : {
        cacheComponents: true,
        partialPrefetching: true,
      }),
};

export default nextConfig;
