/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/ict-nse-scanner",
  assetPrefix: "/ict-nse-scanner/",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
