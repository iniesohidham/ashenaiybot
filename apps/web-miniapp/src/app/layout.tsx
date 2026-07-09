import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "./providers";
import { BottomNav } from "@/components/bottom-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ashenaiy",
  description: "Ashenaiy Telegram Mini App",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <div className="mx-auto min-h-dvh max-w-lg pb-20">{children}</div>
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
