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

export function StopLosersSection() {
  return (
    <section aria-labelledby="c1" className={featureSectionClass}>
      <Container className={splitClass}>
        <SectionCopy
          id="c1"
          num="01"
          title="Stop losers, or convert them to winners"
        >
          <SectionParagraph>
            A loser is an ad with its fair share of impressions, 2× the ad-set
            CPA and nothing to show. It gets stopped and its budget named a new
            home. An ad with a 2.4% CTR and a 0.6× conversion rate is not a
            loser. It&apos;s a promise the landing page breaks. That one gets
            rewritten, not killed.
          </SectionParagraph>
        </SectionCopy>

        <MockPanel>
          <MockHead title="WASTE · last 7d" />
          <MockRow wrapOnMobile value="+₹6,200/wk">
            Audience Network · 18% spend · CPA 3.3×
          </MockRow>
          <MockRow wrapOnMobile value="+₹3,900/wk">
            00:00–04:00 · 15% spend · CPA 3.0×
          </MockRow>
          <MockRow wrapOnMobile value="+₹1,900/wk">
            static_shelf_v1 · ₹2,100 · 0 · fair share ✓
          </MockRow>
          <MockRow wrapOnMobile plainValue value="rewrite">
            &quot;last chance&quot; · CTR 2.4% · CVR 0.6×
          </MockRow>
          <MockRow wrapOnMobile bold value="₹12,000/wk">
            3 stops · 1 rewrite · 0 learning resets
          </MockRow>
        </MockPanel>
      </Container>
    </section>
  );
}
