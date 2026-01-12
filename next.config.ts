import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. PREVENT BUNDLING of backend libraries
  serverExternalPackages: [
    'canvas',      // Native module (Critical fix)
    'adm-zip',     // File handling
    'archiver',    // Stream handling
    'fs-extra',    // File system
    'sharp',       // (If you add image optimization later)
  ],

  // 2. Increase API Body Size (Optional but recommended for Zip uploads)
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  
  // 3. Ensure we bind to 0.0.0.0 if needed (usually handled by package.json, but good to know)
};

export default nextConfig;