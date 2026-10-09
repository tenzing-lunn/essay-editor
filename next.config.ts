import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  // The Antigone text is read at runtime, so ship it with the quote lookup and source check routes
  outputFileTracingIncludes: { "/api/*": ["./data/antigone.xml"] },
};

export default nextConfig;
