import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Vinext checks multipart requests against this limit before route dispatch,
    // including POST /api/analyze. Keep it aligned with PHOTO_LIMITS.request.
    serverActions: { bodySizeLimit: '21mb' },
  },
};

export default nextConfig;
