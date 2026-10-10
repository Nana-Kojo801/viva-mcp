import type { Metadata, Viewport } from "next";
import { Literata, Schibsted_Grotesk } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const serif = Literata({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Viva",
  description: "A voice-first study companion. Add notes, get quizzed out loud.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2338D9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <main className="shell">{children}</main>
        <Nav />
      </body>
    </html>
  );
}
