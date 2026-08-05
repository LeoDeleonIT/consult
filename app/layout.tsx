import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Trinity Consult",
    template: "%s · Trinity Consult",
  },
  description: "Internal treatment-consultation capture and review pilot.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Trinity Consult",
  },
  openGraph: {
    type: "website",
    title: "Trinity Consult",
    description: "Internal consultation pilot",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Trinity Consult internal consultation pilot" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Trinity Consult",
    description: "Internal consultation pilot",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icons/icon-192.png" type="image/png" />
        <link rel="icon" href="/icons/icon-512.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className={`${geistSans.variable} antialiased`}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
