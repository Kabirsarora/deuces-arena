import type { Metadata, Viewport } from "next";

import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const logoUrl = new URL("/icon.png", appUrl).toString();

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${appUrl}#organization`,
      name: "Deuces Arena",
      url: appUrl,
      logo: {
        "@type": "ImageObject",
        url: logoUrl,
        contentUrl: logoUrl,
        width: 512,
        height: 512
      }
    },
    {
      "@type": "WebSite",
      "@id": `${appUrl}#website`,
      url: appUrl,
      name: "Deuces Arena",
      alternateName: "Deuces",
      publisher: {
        "@id": `${appUrl}#organization`
      }
    }
  ]
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "Deuces Arena",
  title: {
    default: "Deuces Arena",
    template: "%s | Deuces Arena"
  },
  description:
    "Play Deuces / Big Two online with friends or bots. Create casual rooms, compete in ranked matches, unlock cosmetics, and review match history.",
  alternates: {
    canonical: appUrl
  },
  icons: {
    icon: [
      {
        url: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon"
      },
      {
        url: "/icon.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    apple: {
      url: "/apple-icon.png",
      sizes: "180x180",
      type: "image/png"
    }
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Deuces Arena",
    description:
      "Play real-time Deuces / Big Two with friends or bots, ranked matches, cosmetics, and match history.",
    url: appUrl,
    siteName: "Deuces Arena",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Deuces Arena",
    description:
      "Play real-time Deuces / Big Two with friends or bots, ranked matches, cosmetics, and match history."
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
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
