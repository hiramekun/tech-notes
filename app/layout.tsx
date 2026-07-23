import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ServiceWorkerRegister } from "@/components/service-worker-register";

import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Tech Notes Cards",
  description: "GitHub Issueから生まれた技術知識を、カードで軽やかに巡る。",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tech Notes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // M3 の surface ロール (light / dark)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaee" },
    { media: "(prefers-color-scheme: dark)", color: "#12140e" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
