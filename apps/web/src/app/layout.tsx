import type { Metadata, Viewport } from "next";

import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "Deuces Arena",
  title: {
    default: "Deuces Arena",
    template: "%s | Deuces Arena"
  },
  description:
    "Mobile-first Deuces / Big Two platform with online rooms, bot opponents, replays, cosmetics, and ML-ready move analysis.",
  alternates: {
    canonical: appUrl
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Deuces Arena",
    description:
      "Play real-time Deuces / Big Two rooms with bots, server-authoritative rules, replays, and ML-ready move data.",
    url: appUrl,
    siteName: "Deuces Arena",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Deuces Arena",
    description:
      "Real-time multiplayer Deuces / Big Two with online rooms, bots, replays, and simulation-ready move history."
  },
  appleWebApp: {
    capable: true,
    title: "Deuces Arena",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#080a0d",
  colorScheme: "dark"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
