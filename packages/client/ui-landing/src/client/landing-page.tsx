import { useEffect } from "react";

import { AdSet } from "./ad-set";
import { ClosingSection } from "./closing-section";
import { ControlSection } from "./control-section";
import { Footer } from "./footer";
import { Header } from "./header";
import { Hero } from "./hero";
import { IncreaseRoasSection } from "./increase-roas-section";
import { SpotWinnersSection } from "./spot-winners-section";
import { StopLosersSection } from "./stop-losers-section";
import { TeamSection } from "./team-section";
import { Ticker } from "./ticker";
import { WatchMarketSection } from "./watch-market-section";

/** Browser title for the marketing landing route. */
export const LANDING_TITLE = "Uno — AI that finds winning ads";

export function LandingPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = LANDING_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto scroll-smooth bg-[#F3EFE4] text-[18px] leading-[1.5] text-[#0E0E0E] [font-family:var(--font-space-grotesk)]">
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
