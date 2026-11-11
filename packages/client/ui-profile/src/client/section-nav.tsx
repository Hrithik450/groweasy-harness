import { SectionNavClient, type SectionNavItem } from "./section-nav-client";

const navItems: SectionNavItem[] = [
  {
    id: "p1",
    number: "01",
    label: "Business & tracking",
    status: "✓",
    statusClass: "text-[#1FA463]",
  },
  {
    id: "p2",
    number: "02",
    label: "Products",
    status: "✓",
    statusClass: "text-[#1FA463]",
  },
  {
    id: "p3",
    number: "03",
    label: "Locations",
    status: "✓",
    statusClass: "text-[#1FA463]",
  },
  {
    id: "p4",
    number: "04",
    label: "Competitors",
    status: "2 NEW",
    statusClass: "text-[#FF4D1C]",
  },
  {
    id: "p5",
    number: "05",
    label: "Brand",
    status: "LOGO",
    statusClass: "text-[#9A5B10]",
  },
  {
    id: "p6",
    number: "06",
    label: "Goals",
    status: "OPTIONAL",
    statusClass: "text-[#6B6657]",
  },
];

export function SectionNav() {
  return <SectionNavClient items={navItems} />;
}
