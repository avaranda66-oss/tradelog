import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WINJournal / TradeLog v2 — Diário de Trade",
  description: "Plataforma local de diário de trade com narração por voz, análise de operações e screenshots",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} dark`}>
      <body className="h-screen bg-[#070a11] text-slate-100 font-[family-name:var(--font-inter)] flex flex-col overflow-hidden antialiased">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 p-5 overflow-y-auto bg-[#070a11]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
