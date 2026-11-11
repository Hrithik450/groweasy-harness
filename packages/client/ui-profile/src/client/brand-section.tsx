import { SectionHeading } from "./section-heading";
import {
  field,
  fieldGridWide,
  fieldLabel,
  focusRing,
  inputDanger,
  monoFont,
  muted2Text,
  mutedText,
  sectionClass,
  textarea,
  toneOutline,
  toneSelected,
} from "./styles";

const tones = ["Warm", "Honest", "Traditional"];
const otherTones = ["Playful", "Premium"];

export function BrandSection() {
  return (
    <section aria-labelledby="h5x" className={sectionClass} id="p5">
      <SectionHeading headingId="h5x" number="05" title="Brand" />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-0.5 border-2 border-[#0E0E0E] bg-[#0E0E0E]">
        <button
          className={`flex min-h-[150px] w-full cursor-pointer flex-col items-center justify-center gap-1.5 border-0 bg-[#FFF1E9] p-4 text-center text-[#0E0E0E] [font:inherit] ${focusRing}`}
          type="button"
        >
          <span className={`${monoFont} text-[11px] text-[#9A5B10]`}>
            MISSING
          </span>
          <b className="[overflow-wrap:anywhere]">Add your logo</b>
          <span className={`text-[13px] ${muted2Text}`}>
            SVG or PNG · light and dark
          </span>
        </button>

        <div className="flex min-w-0 flex-col gap-2.5 bg-[#F3EFE4] p-4">
          <span className={`${monoFont} text-[11px] ${mutedText}`}>
            COLOURS
          </span>
          <div className="flex flex-wrap gap-1.5">
            <span className="h-11 w-11 shrink-0 bg-[#2E5B3A]" />
            <span className="h-11 w-11 shrink-0 bg-[#D9A23A]" />
            <span className="h-11 w-11 shrink-0 border border-[#E9E4D6] bg-[#FAF5E8]" />
            <button
              aria-label="Add colour"
              className={`h-11 w-11 shrink-0 cursor-pointer border-[1.5px] border-dashed border-[#6B6657] bg-transparent [font:inherit] text-[#0E0E0E] ${focusRing}`}
              type="button"
            >
              +
            </button>
          </div>
          <span
            className={`${monoFont} text-[11px] ${mutedText} [overflow-wrap:anywhere]`}
          >
            #2E5B3A · #D9A23A · #FAF5E8
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-2.5 bg-[#F3EFE4] p-4">
          <span className={`${monoFont} text-[11px] ${mutedText}`}>TONE</span>
          <div className="flex flex-wrap gap-1.5">
            {tones.map((tone) => (
              <span className={toneSelected} key={tone}>
                {tone}
              </span>
            ))}
            {otherTones.map((tone) => (
              <span className={toneOutline} key={tone}>
                {tone}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={fieldGridWide}>
        <div className={field}>
          <label className={fieldLabel} htmlFor="w-use">
            WORDS TO USE
          </label>
          <textarea
            className={textarea}
            defaultValue="cold-pressed, small batch, from our mill, pressed this week"
            id="w-use"
            rows={3}
          />
        </div>
        <div className={field}>
          <label className={fieldLabel} htmlFor="w-avoid">
            WORDS TO AVOID · Creator never uses these
          </label>
          <textarea
            className={`${textarea} ${inputDanger}`}
            defaultValue="heart-healthy, cures, 100% chemical-free, best in India"
            id="w-avoid"
            rows={3}
          />
        </div>
      </div>
    </section>
  );
}
