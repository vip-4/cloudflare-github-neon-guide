/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  experimental: {
    serverComponentsExternalPackages: ['@neondatabase/serverless'],
  },
};

export default nextConfig;
