import type { Metadata } from "next";
import "../src/styles.css";
export const metadata: Metadata = {
  title: "Bonkers Blackjack — Cards on the table. Rules out the window? Never.",
  description:
    "Your crew. Your table. A little Bonkers. Social blackjack with verifiable rounds. Play-money preview.",
  icons: { icon: "/bonkers-blackjack-logo.png" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
