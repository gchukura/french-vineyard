import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";

import { Analytics } from "@/components/consent/Analytics";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { Footer } from "@/components/footer/Footer";
import { Header } from "@/components/header/Header";
import { CONSENT_BOOT_SCRIPT } from "@/lib/consent";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// next/font downloads these at build time and serves them from our own
// domain. Google's "latin" subset already covers French diacritics
// (é è ê ë à â ç î ï ô û ù ü ÿ œ æ and capitals), so no latin-ext is needed.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "FrenchVineyard.com", template: "%s | FrenchVineyard.com" },
  description: "An English-language travel guide to the wine regions of France.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets data-consent before hydration.
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: CONSENT_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-button bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <Header />
        {children}
        <Footer />
        <ConsentBanner />
        <Analytics />
      </body>
    </html>
  );
}
