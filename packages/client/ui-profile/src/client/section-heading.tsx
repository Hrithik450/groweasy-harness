import type { ReactNode } from "react";

import {
  sectionHead,
  sectionHeadRow,
  sectionNum,
  sectionTitle,
} from "./styles";

type SectionHeadingProps = {
  number: string;
  title: ReactNode;
  headingId: string;
  trailing?: ReactNode;
};

export function SectionHeading({
  number,
  title,
  headingId,
  trailing,
}: SectionHeadingProps) {
  const head = (
    <div className={sectionHead}>
      <span className={sectionNum}>{number}</span>
      <h2 id={headingId} className={sectionTitle}>
        {title}
      </h2>
    </div>
  );

  if (!trailing) {
    return head;
  }

  return (
    <div className={sectionHeadRow}>
      {head}
      {trailing}
    </div>
  );
}
