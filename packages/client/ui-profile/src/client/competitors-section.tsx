import { SectionHeading } from "./section-heading";
import {
  chip,
  chipButton,
  chips,
  fieldGridWide,
  fieldLabel,
  focusRing,
  monoFont,
  sectionClass,
  sectionNote,
} from "./styles";

type Competitor = {
  name: string;
  link: string;
  active: string;
  win?: string;
  tracking: "ON" | "Track";
  found?: string;
};

const competitors: Competitor[] = [
  {
    name: "Ghani Gold Oils",
    link: "facebook.com/ads/library/?view_all_page_id=1043… ↗",
    active: "38",
    win: "2 win",
    tracking: "ON",
  },
  {
    name: "PureDrop Naturals",
    link: "facebook.com/ads/library/?view_all_page_id=2291… ↗",
    active: "21",
    win: "1 win",
    tracking: "ON",
  },
  {
    name: "Chekku House",
    link: "facebook.com/ads/library/?view_all_page_id=5520… ↗",
    active: "9",
    tracking: "ON",
  },
  {
    name: "Mill Fresh Co.",
    link: "facebook.com/ads/library/?view_all_page_id=8817… ↗",
    active: "14",
    win: "1 pot.",
    tracking: "Track",
    found: "FOUND BY STRATEGIST · on 4 phrases",
  },
  {
    name: "Vriksha Oils",
    link: "facebook.com/ads/library/?view_all_page_id=6602… ↗",
    active: "6",
    tracking: "Track",
    found: "FOUND BY STRATEGIST · on 3 phrases",
  },
];

const phraseGroups = [
  {
    label: "CATEGORY PHRASES",
    phrases: ["cold pressed oil", "wood pressed oil", "kachi ghani"],
  },
  {
    label: "PRODUCT PHRASES",
    phrases: ["groundnut oil 1 litre", "a2 ghee", "oil gift box"],
  },
  {
    label: "LANGUAGE PHRASES",
    phrases: ["chekku ennai", "ganuga nune"],
  },
];

const rowGrid =
  "grid min-w-0 grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_90px_110px] items-center gap-3 border-b border-[#E9E4D6] px-3.5 py-3 last:border-b-0 max-[700px]:grid-cols-[minmax(0,1fr)_auto] max-[700px]:items-start max-[700px]:gap-x-3 max-[700px]:gap-y-2 max-[700px]:px-3.5 max-[700px]:py-3.5";

const trackButton =
  "min-h-9 cursor-pointer whitespace-nowrap px-2.5 text-xs font-bold [font:inherit] hover:opacity-80 max-[700px]:col-start-2 max-[700px]:row-start-1 max-[700px]:justify-self-end max-[700px]:self-start";

export function CompetitorsSection() {
  return (
    <section aria-labelledby="h4x" className={sectionClass} id="p4">
      <SectionHeading
        headingId="h4x"
        number="04"
        title="Competitors & spy phrases"
        trailing={
          <span className={sectionNote}>
            Strategist scans these every day at 06:00
          </span>
        }
      />

      <div className="flex min-w-0 border-2 border-[#0E0E0E] bg-white">
        <label className="sr-only" htmlFor="comp-add">
          Add a competitor
        </label>
        <input
          autoComplete="off"
          className={`h-12 min-w-0 flex-1 border-0 bg-transparent px-3.5 text-[15px] text-[#0E0E0E] [font:inherit] placeholder:text-[#6B6657] max-[400px]:px-2.5 ${focusRing}`}
          id="comp-add"
          placeholder="Brand name, Facebook page or website"
          type="text"
        />
        <button
          className={`min-h-12 shrink-0 cursor-pointer border-0 bg-[#0E0E0E] px-[18px] font-bold whitespace-nowrap text-[#F3EFE4] [font:inherit] hover:opacity-85 max-[520px]:px-3.5 max-[400px]:px-3 max-[400px]:text-sm ${focusRing}`}
          type="button"
        >
          Find &amp; track
        </button>
      </div>

      <div className="min-w-0 border-2 border-[#0E0E0E] bg-[#FBF9F3] text-sm">
        <div
          className={`grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_90px_110px] gap-3 border-b-2 border-[#0E0E0E] px-3.5 py-2.5 ${monoFont} text-[11px] text-[#6B6657] max-[700px]:hidden`}
        >
          <span>COMPETITOR</span>
          <span>AD LIBRARY LINK</span>
          <span>ACTIVE ADS</span>
          <span>TRACKING</span>
        </div>

        {competitors.map((competitor) => (
          <div
            className={`${rowGrid} ${competitor.found ? "bg-[#FFF1E9]" : ""}`}
            key={competitor.name}
          >
            <span className="flex min-w-0 flex-col max-[700px]:col-start-1 max-[700px]:row-start-1">
              <b className="[overflow-wrap:anywhere]">{competitor.name}</b>
              {competitor.found ? (
                <span
                  className={`${monoFont} text-[10px] text-[#FF4D1C] [overflow-wrap:anywhere]`}
                >
                  {competitor.found}
                </span>
              ) : null}
            </span>
            <a
              className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap underline underline-offset-2 ${monoFont} text-xs hover:text-[#FF4D1C] max-[700px]:col-span-2 max-[700px]:col-start-1 max-[700px]:row-start-2 max-[700px]:overflow-visible max-[700px]:whitespace-normal max-[700px]:text-clip max-[700px]:[overflow-wrap:anywhere] ${focusRing}`}
              href="#p4"
            >
              {competitor.link}
            </a>
            <span
              className={`min-w-0 ${monoFont} [overflow-wrap:anywhere] max-[700px]:col-span-2 max-[700px]:col-start-1 max-[700px]:row-start-3`}
            >
              {competitor.active}
              {competitor.win ? (
                <>
                  {" · "}
                  <span className="text-[#FF4D1C]">{competitor.win}</span>
                </>
              ) : null}
            </span>
            <button
              aria-pressed={competitor.tracking === "ON"}
              className={`${trackButton} ${
                competitor.tracking === "ON"
                  ? "border-0 bg-[#0E0E0E] text-[#F3EFE4]"
                  : "border-2 border-[#FF4D1C] bg-transparent text-[#0E0E0E]"
              } ${focusRing}`}
              type="button"
            >
              {competitor.tracking}
            </button>
          </div>
        ))}
      </div>

      <div className={fieldGridWide}>
        {phraseGroups.map((group) => (
          <div className="flex min-w-0 flex-col gap-2" key={group.label}>
            <span className={fieldLabel}>{group.label}</span>
            <div className={chips}>
              {group.phrases.map((phrase) => (
                <span className={chip} key={phrase}>
                  {phrase}
                </span>
              ))}
              <button aria-label={`Add ${group.label.toLowerCase()}`} className={chipButton} type="button">
                +
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
