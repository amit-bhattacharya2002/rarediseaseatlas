import type { Metadata } from "next";
import { Figtree, IBM_Plex_Mono, Literata, Montserrat } from "next/font/google";
import { IngestProgressBanner } from "@/components/IngestProgressBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-montserrat",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://is-anyone-working-on-this.vercel.app"),
  title: {
    default: "Is Anyone Working On This?",
    template: "%s · Is Anyone Working On This?",
  },
  description:
    "An open rare disease research landscape: publications, researchers, interventional trials, observational studies, and gene–disease validity — for every known rare condition.",
  openGraph: {
    siteName: "Is Anyone Working On This?",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${literata.variable} ${figtree.variable} ${montserrat.variable} ${plexMono.variable}`}
    >
      <body className="font-sans antialiased">
        <IngestProgressBanner />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
