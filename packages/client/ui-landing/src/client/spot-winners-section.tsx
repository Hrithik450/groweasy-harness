import { Container } from "./container";
import {
  MockHead,
  MockPanel,
  MockRow,
  SectionCopy,
  SectionParagraph,
  featureSectionClass,
  splitClass,
} from "./ui";

export function SpotWinnersSection() {
  return (
    <section aria-labelledby="c2" className={featureSectionClass}>
      <Container className={splitClass}>
        <SectionCopy id="c2" num="02" title="Spot winners in days">
          <SectionParagraph>
            Meta&apos;s delivery system votes before your CPA does. It shifts
            impressions toward what it predicts will convert, within hours. Uno
            reads the vote, confirms with hook rate and CTR, then with cost per
            result at 80% confidence. Winners are called in days, protected from
            budget cuts, and multiplied before they fade.
          </SectionParagraph>
        </SectionCopy>

        <MockPanel dark>
          <MockHead dark title="WINNER CALL · UGC_unboxing_v3" />
          <MockRow dark wrapOnMobile value="meta's vote">
            d1 · imp share 31% vs fair 10%
          </MockRow>
          <MockRow dark wrapOnMobile value="leading">
            d2 · hook 38% · CTR 1.9× median
          </MockRow>
          <MockRow dark wrapOnMobile value="82% conf">
            d4 · 14 results · CPA ₹412 vs ₹690
          </MockRow>
          <MockRow dark wrapOnMobile value="holding ✓">
            d7 · frequency 1.4 · CPA holding
          </MockRow>
          <MockRow dark wrapOnMobile bold value="day 4">
            PROVEN · protected · 4 variants drafted
          </MockRow>
        </MockPanel>
      </Container>
    </section>
  );
}
