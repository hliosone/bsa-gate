import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "BSA Gate",
  description: "A compliance-and-safety checkpoint for stablecoin payments — ENSv2 + Intercepta + x402.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <div className="wrap">
            <span className="brand">BSA&nbsp;Gate</span>
            <nav>
              <a href="/">Home</a>
              <a href="/agent">Manage agent</a>
              <a href="/checkout">Checkout demo</a>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer>
          <div className="wrap">BSA Gate — ETHGlobal Tokyo 2026 · ENSv2 + Intercepta + x402 on Sepolia</div>
        </footer>
      </body>
    </html>
  );
}
