import type { Metadata } from "next";
import localFont from "next/font/local";
const bodyFont = localFont({
  variable: "--font-body",
  display: "swap",
  src: [
    {
      path: "../node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../node_modules/@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff2",
      weight: "500",
    },
    {
      path: "../node_modules/@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff2",
      weight: "600",
    },
    {
      path: "../node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff2",
      weight: "700",
    },
  ],
});
const headingFont = localFont({
  variable: "--font-heading",
  display: "swap",
  src: [
    {
      path: "../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2",
      weight: "500",
    },
    {
      path: "../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2",
      weight: "600",
    },
    {
      path: "../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2",
      weight: "700",
    },
    {
      path: "../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2",
      weight: "800",
    },
  ],
});
import "../src/styles.css";
import SiteShell from "../src/SiteShell";
export const metadata: Metadata = {
  title: "Bonkers — Blackjack & Toin Coss",
  description:
    "Play Blackjack and site-wide Bonkers Toin Coss flips with USDC on Base.",
  icons: { icon: "/bonkers-blackjack-logo.png" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body><SiteShell>{children}</SiteShell></body>
    </html>
  );
}
