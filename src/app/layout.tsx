import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Schedule",
  description: "Responsive store scheduling MVP for availability, coverage, swaps, publishing, and hours."
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
