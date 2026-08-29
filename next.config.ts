import type { NextConfig } from "next";

// Cloudflare Pages はサイトをルートで配信するので basePath は要らない。
// (GitHub Pages のプロジェクトページ向けに /<repo> を前置していた分岐は畳んだ)
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: "",
  },
};

export default nextConfig;
