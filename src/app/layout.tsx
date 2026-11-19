import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uno",
  description: "AI that finds winning ads",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
