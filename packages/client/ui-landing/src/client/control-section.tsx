import { Container } from "./container";
import { featureSectionClass } from "./ui";

const cards = [
  {
    num: "0",
    title: "changes without your tap.",
    body: "Read-only on connect. Grant write access only when you want one-tap Apply.",
  },
  {
    num: "1",
    title: "tap to undo anything.",
    body: "Every applied move is tagged, re-measured and reversible.",
  },
  {
    num: "2",
    title: "batches in test per winner.",
    body: "Variants launch beside the winner, never instead of it. One axis changed per variant.",
  },
  {
    num: "3",
    title: "agents, one account memory.",
    body: "Manager, Creator, Strategist. Products, geos, competitors, winning DNA and failed tests in one profile.",
  },
];

export function ControlSection() {
  return (
    <section aria-label="Control" className={featureSectionClass}>
      <Container className="flex flex-col gap-8">
        <h2 className="m-0 max-w-[1000px] break-words [font-family:var(--font-syne)] text-[clamp(36px,5vw,72px)] font-extrabold leading-[0.95] tracking-[-0.045em] [text-wrap:balance]">
          You&apos;re still the buyer. Uno is the analyst who doesn&apos;t sleep.
        </h2>

        <div className="grid min-w-0 grid-cols-4 gap-0.5 border-2 border-[#0E0E0E] bg-[#0E0E0E] max-[1100px]:grid-cols-2 max-[600px]:grid-cols-1">
          {cards.map((card) => (
            <div
              key={card.num}
              className="flex min-w-0 flex-col gap-2 bg-[#F3EFE4] p-6 max-[600px]:p-5"
            >
              <span className="[font-family:var(--font-syne)] text-[40px] font-extrabold leading-none tracking-[-0.04em] text-[#FF4D1C]">
                {card.num}
              </span>
              <b className="break-words text-[18px] leading-[1.35] max-[600px]:text-[17px]">
                {card.title}
              </b>
              <span className="break-words text-[#3A372F]">{card.body}</span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
