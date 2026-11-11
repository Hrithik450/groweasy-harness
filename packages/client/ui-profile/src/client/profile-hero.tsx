import { displayFont, monoFont, shell } from "./styles";

const readers = ["01 Manager", "02 Creator", "03 Strategist"];

export function ProfileHero() {
  return (
    <section className="border-b-2 border-[#0E0E0E]">
      <div
        className={`${shell} flex flex-wrap items-end justify-between gap-6 pb-6 pt-12 max-[640px]:pb-5 max-[640px]:pt-8`}
      >
        <div className="flex min-w-0 flex-[1_1_100%] flex-col gap-2.5">
          <span
            className={`${monoFont} text-xs text-[#6B6657] [overflow-wrap:anywhere]`}
          >
            BUSINESS PROFILE · OIL &amp; CO.
          </span>
          <h1
            className={`m-0 ${displayFont} text-[clamp(36px,7vw,96px)] font-extrabold leading-[0.92] tracking-[-0.05em] [overflow-wrap:break-word] max-[400px]:text-[clamp(34px,9vw,38px)]`}
          >
            The brief your agents{" "}
            <span className="text-[#FF4D1C]">never forget.</span>
          </h1>
        </div>
        <div
          aria-label="Read by agents"
          className={`grid max-w-full flex-[0_1_auto] grid-cols-3 gap-0.5 border-2 border-[#0E0E0E] bg-[#0E0E0E] ${monoFont} text-[11px] max-[640px]:w-full max-[640px]:grid-cols-1`}
          role="group"
        >
          {readers.map((reader) => (
            <div className="min-w-0 bg-[#F3EFE4] px-3.5 py-2.5" key={reader}>
              <span className="text-[#6B6657]">READ BY</span>
              <br />
              <b className="inline-block text-[13px] [overflow-wrap:anywhere]">
                {reader}
              </b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
