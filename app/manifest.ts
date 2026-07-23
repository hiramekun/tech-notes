import type { MetadataRoute } from "next";

// GitHub Pages のプロジェクトページでは basePath (/tech-notes) が付く。
// manifest 内の URL は自動では basePath が付かないため、明示的に前置する。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tech Notes",
    short_name: "Tech Notes",
    description: "GitHub Issueから生まれた技術ノートを、カードで巡るアーカイブ。",
    id: `${basePath}/`,
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaee",
    theme_color: "#fafaee",
    lang: "ja",
    categories: ["education", "productivity", "books"],
    icons: [
      {
        src: `${basePath}/icons/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icons/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
