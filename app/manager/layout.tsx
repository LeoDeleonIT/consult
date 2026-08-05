import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manager",
};

export default function ManagerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
