import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BudgetPal — plan smarter, pay with PayPal",
  description:
    "Set category budgets, track spending, and let a local AI stage your wishlist into affordable milestones you approve and pay for with PayPal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body>
    </html>
  );
}
