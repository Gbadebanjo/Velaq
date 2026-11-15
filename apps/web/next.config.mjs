/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@velaq/contracts"],
  poweredByHeader: false,
  // Next.js's development button sits bottom-left by default, on top of the menu's account card.
  devIndicators: { position: "bottom-right" },
};
export default nextConfig;
