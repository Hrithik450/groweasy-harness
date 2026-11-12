import { Container } from "./container";
import {
  MockHead,
  MockPanel,
  MockRow,
  MockSub,
  SectionCopy,
  SectionParagraph,
  featureSectionClass,
  splitClass,
} from "./ui";

export function WatchMarketSection() {
  return (
    <section aria-labelledby="c4" className={featureSectionClass}>
      <Container className={splitClass}>
        <SectionCopy
          id="c4"
          num="04"
          title="Watch market to find you trends"
        >
          <SectionParagraph>
            Every morning, the Ad Library for your competitors, category and
            product phrases, sorted by impressions. Long-running winners (30+
            days, top 20%) and potential winners (new, already top 20%) get
            torn down into hook pattern, beat timing, offer framing and proof
            device. You remix the structure with your product. Never their
            assets. Spend is never estimated.
          </SectionParagraph>
        </SectionCopy>

        <MockPanel>
          <MockHead title="AD LIBRARY · sorted by impressions · 06:00" />
          <MockRow stack>
            <span>
              <b>LONG-RUNNING</b> · 34d · #2 · &quot;cold pressed oil&quot;
            </span>
            <MockSub>
              proof-led UGC · 6 versions · question → demo → price at 18s
            </MockSub>
          </MockRow>
          <MockRow stack>
            <span>
              <b className="text-[#FF4D1C]">POTENTIAL</b> · 5d · #3 · tracked
              competitor
            </span>
            <MockSub>
              founder talking-head · EMI framing · watching for d30
            </MockSub>
          </MockRow>
          <MockRow stack>
            <span>
              <b>SCALING</b> · 4 new versions of a 21d ad
            </span>
            <MockSub>they found something · teardown ready</MockSub>
          </MockRow>
          <MockRow stack>
            <span>
              <b>PRICE MOVE</b> · ₹299 on SKU you sell at ₹349
            </span>
            <MockSub>value-per-litre angle → Ideas</MockSub>
          </MockRow>
        </MockPanel>
      </Container>
    </section>
  );
}
