import { SectionHeading } from "./section-heading";
import {
  fieldGridWide,
  fieldLabel,
  focusRing,
  pill,
  pillButton,
  pillExcluded,
  pillOutline,
  pills,
  sectionClass,
} from "./styles";

const regions = ["Maharashtra", "Karnataka", "Tamil Nadu", "Delhi NCR"];
const languages = ["English", "Hindi", "Tamil", "Kannada"];

export function LocationsSection() {
  return (
    <section aria-labelledby="h3x" className={sectionClass} id="p3">
      <SectionHeading headingId="h3x" number="03" title="Locations" />

      <div className={fieldGridWide}>
        <div className="flex min-w-0 flex-col gap-2.5">
          <span className={fieldLabel}>SELL IN · INDIA</span>
          <div className={pills}>
            {regions.map((region) => (
              <span className={pill} key={region}>
                {region}
              </span>
            ))}
            <span className={pillExcluded}>Haryana</span>
            <button className={pillButton} type="button">
              + Region, city or PIN
            </button>
          </div>
          <span className={fieldLabel}>
            Haryana excluded by Manager on 2 Nov · CPA 2.1× ·{" "}
            <a
              className={`underline underline-offset-2 hover:text-[#FF4D1C] ${focusRing}`}
              href="#p3"
            >
              undo
            </a>
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-2.5">
          <span className={fieldLabel}>AD LANGUAGES</span>
          <div className={pills}>
            {languages.map((language) => (
              <span className={pill} key={language}>
                {language}
              </span>
            ))}
            <span className={pillOutline}>Marathi</span>
            <span className={pillOutline}>Telugu</span>
          </div>
        </div>
      </div>
    </section>
  );
}
