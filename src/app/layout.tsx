import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BRAND_FAVICON, BRAND_NAME } from "@/lib/branding/assets";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BRAND_NAME} — Gestionale aziendale`,
  description: "Piattaforma gestionale con accesso per ruoli e aree",
  icons: {
    icon: [{ url: BRAND_FAVICON, type: "image/jpeg" }],
    shortcut: BRAND_FAVICON,
    apple: BRAND_FAVICON,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
