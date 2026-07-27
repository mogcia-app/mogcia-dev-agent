import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOGCIA Dev Agent",
  description: "Blank MOGCIA Dev Agent workspace with Firebase and Cloud Run integration hooks.",
  icons: {
    icon: "/m-dev-agent.png",
    apple: "/m-dev-agent.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
