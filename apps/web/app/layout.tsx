import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "BSA Gate",
  description: "A safety and compliance gate for stablecoin payments — ENSv2 decides who may pay, Intercepta decides if it's safe, then it settles over x402 on Ethereum.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <div className="wrap">
            <a className="brand" href="/"><span className="mark" />BSA Gate</a>
            <nav>
              <a href="/">Overview</a>
              <a href="/checkout">Checkout</a>
              <a className="hide-sm" href="/agent">Agent console</a>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer>
          <div className="wrap">
            BSA Gate — one gate for stablecoin payments. ENSv2 decides who may pay, Intercepta decides whether it&rsquo;s
            safe, then USDC settles over x402 on Ethereum Sepolia.
          </div>
        </footer>
      </body>
    </html>
  );
}
