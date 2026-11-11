import { useEffect } from "react";

import { BrandSection } from "./brand-section";
import { BusinessTrackingSection } from "./business-tracking-section";
import { CompetitorsSection } from "./competitors-section";
import { GoalsSection } from "./goals-section";
import { LocationsSection } from "./locations-section";
import { ProfileHeader } from "./profile-header";
import { ProfileHero } from "./profile-hero";
import { ProductsSection } from "./products-section";
import { SectionNav } from "./section-nav";
import { shell } from "./styles";

/** Browser title for the profile route. */
export const PROFILE_TITLE = "Uno — Business profile";

export function ProfilePage() {
  useEffect(() => {
    const previous = document.title;
    document.title = PROFILE_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <main className="h-dvh w-full shrink-0 overflow-x-hidden overflow-y-auto bg-[#F3EFE4] text-[15px] leading-normal text-[#0E0E0E] [font-family:var(--font-space-grotesk)] motion-safe:scroll-smooth">
      <ProfileHeader />
      <ProfileHero />

      <div
        className={`${shell} flex items-start gap-0 max-[900px]:flex-col`}
      >
        <SectionNav />
        <div className="min-w-0 flex-[1_1_640px] border-l-2 border-[#0E0E0E] max-[900px]:w-full max-[900px]:flex-none max-[900px]:border-l-0">
          <BusinessTrackingSection />
          <ProductsSection />
          <LocationsSection />
          <CompetitorsSection />
          <BrandSection />
          <GoalsSection />
        </div>
      </div>
    </main>
  );
}
