import type { Metadata } from "next";
import "@fontsource-variable/montserrat";
import "./globals.css";

export const metadata: Metadata = {
  title: "Velaq — One Platform. Every Business Function.",
  description:
    "Velaq runs your organisation's people, money, operations and customers on one platform, and gives every professional a workspace of their own.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Marks that JavaScript runs, so scroll-in animations only hide content when they can reveal it. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
