import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk, Syne } from "next/font/google";

import { AdSet } from "@/components/landing/ad-set";
import { ClosingSection } from "@/components/landing/closing-section";
import { ControlSection } from "@/components/landing/control-section";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { IncreaseRoasSection } from "@/components/landing/increase-roas-section";
import { SpotWinnersSection } from "@/components/landing/spot-winners-section";
import { StopLosersSection } from "@/components/landing/stop-losers-section";
import { TeamSection } from "@/components/landing/team-section";
import { Ticker } from "@/components/landing/ticker";
import { WatchMarketSection } from "@/components/landing/watch-market-section";

const syne = Syne({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Uno — AI that finds winning ads",
};

export function LandingPage() {
  return (
    <div
      className={`${syne.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable} min-h-dvh w-full bg-background text-[18px] leading-[1.5] text-foreground [font-family:var(--font-space-grotesk)]`}
    >
      <Header />
      <main>
        <Hero />
        <AdSet />
        <Ticker />
        <StopLosersSection />
        <SpotWinnersSection />
        <IncreaseRoasSection />
        <WatchMarketSection />
        <TeamSection />
        <ControlSection />
        <ClosingSection />
      </main>
      <Footer />
    </div>
  );
}
