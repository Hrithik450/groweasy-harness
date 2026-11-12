import styles from "./ticker.module.css";

const items = [
  {
    text: "06:00 AD LIBRARY · 412 ads pulled · 3 launches · 1 potential winner (#3 by impressions, day 5)",
    accent: false,
  },
  {
    text: "06:30 WINNERS · UGC_unboxing_v3 → PROVEN · 46% imp share · CPA ₹412 vs ₹690 median",
    accent: true,
  },
  {
    text: "07:00 SUGGESTIONS · stop static_shelf_v1 → +₹1,900/wk · exclude Audience Network → +₹6,200/wk · daypart 00–04 → +₹3,900/wk",
    accent: false,
  },
  {
    text: "07:00 VARIANTS · 4 drafted: hook A, hook B, visual, as static · awaiting approval",
    accent: false,
  },
  {
    text: "09:00 DAILY REPORT · ROAS 3.1 vs account 28d 2.4 · 1 winner · 3 moves · market: competitor price cut on SKU-14",
    accent: true,
  },
];

export function Ticker() {
  return (
    <section
      aria-label="Live feed"
      className="overflow-hidden border-y-2 border-[#0E0E0E] bg-[#0E0E0E] py-3.5 [font-family:var(--font-jetbrains-mono)] text-[14px] leading-normal whitespace-nowrap text-[#F3EFE4] max-[600px]:py-3 max-[600px]:text-[12px]"
    >
      <div className={`${styles.marquee} flex w-max`}>
        {[0, 1].map((copy) =>
          items.map((item, index) => (
            <span
              key={`${copy}-${index}`}
              className={`shrink-0 px-8 max-[600px]:px-[18px]${
                item.accent ? " text-[#FF4D1C]" : ""
              }`}
            >
              {item.text}
            </span>
          )),
        )}
      </div>
    </section>
  );
}
