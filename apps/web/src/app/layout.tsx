import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Deuces Arena",
  description:
    "Mobile-first Deuces / Big Two platform with a reusable TypeScript engine and bot opponents."
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
