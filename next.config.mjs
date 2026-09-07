/** @type {import('next').NextConfig} */
// GitHub Pages 镜像部署到 https://vip-4.github.io/cloudflare-github-neon-guide/ 时需要子路径前缀，
// Cloudflare Pages 部署根路径时保持为空。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  output: 'export',
  basePath: basePath ? basePath : undefined,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: { unoptimized: true },
  experimental: {
    serverComponentsExternalPackages: ['@neondatabase/serverless'],
  },
};

export default nextConfig;
