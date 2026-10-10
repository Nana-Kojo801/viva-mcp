import type { Metadata, Viewport } from "next";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
