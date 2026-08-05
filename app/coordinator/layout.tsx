import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coordinator",
};

export default function CoordinatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
