import { SectionHeading } from "./section-heading";
import {
  buttonDark,
  buttonOutline,
  chip,
  chipButton,
  chipDark,
  chips,
  monoFont,
  sectionActionButton,
  sectionActions,
  sectionClass,
} from "./styles";

type Product = {
  name: string;
  category: string;
  price: string;
  landing: string;
  ads: string;
  landingClass?: string;
  adsClass?: string;
};

const products: Product[] = [
  {
    name: "Diwali gift box · 3 oils",
    category: "Gift boxes",
    price: "₹999",
    landing: "/diwali-box",
    ads: "WINNER",
  },
  {
    name: "Groundnut oil · 1 L",
    category: "Cooking oils",
    price: "₹349",
    landing: "/groundnut-oil",
    ads: "WINNER",
  },
  {
    name: "Sesame oil · 500 ml",
    category: "Cooking oils",
    price: "₹249",
    landing: "/sesame-oil",
    ads: "LIVE · NO WINNER",
  },
  {
    name: "Coconut oil · 1 L",
    category: "Cooking oils",
    price: "₹399",
    landing: "/coconut-oil",
    ads: "LIVE · NO WINNER",
  },
  {
    name: "A2 cow ghee · 500 ml",
    category: "Ghee",
    price: "₹749",
    landing: "add a page",
    landingClass: "text-[#9A5B10]",
    ads: "NO ADS YET",
    adsClass: "text-[#6B6657]",
  },
];

export function ProductsSection() {
  return (
    <section aria-labelledby="h2x" className={sectionClass} id="p2">
      <SectionHeading
        headingId="h2x"
        number="02"
        title="Products & categories"
        trailing={
          <div className={sectionActions}>
            <button
              className={`${buttonOutline} ${sectionActionButton}`}
              type="button"
            >
              Import from website
            </button>
            <button
              className={`${buttonDark} ${sectionActionButton}`}
              type="button"
            >
              + Add product
            </button>
          </div>
        }
      />

      <div className={chips}>
        <span className={chipDark}>ALL · 5</span>
        <span className={chip}>COOKING OILS · 3</span>
        <span className={chip}>GHEE · 1</span>
        <span className={chip}>GIFT BOXES · 1</span>
        <button className={chipButton} type="button">
          + CATEGORY
        </button>
      </div>

      <div className="max-w-full overflow-x-auto border-2 border-[#0E0E0E] bg-white [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr
              className={`border-b-2 border-[#0E0E0E] text-left ${monoFont} text-[11px] text-[#6B6657]`}
            >
              <th className="px-3.5 py-2.5 font-medium" scope="col">
                PRODUCT
              </th>
              <th className="px-3.5 py-2.5 font-medium" scope="col">
                CATEGORY
              </th>
              <th
                className="px-3.5 py-2.5 text-right font-medium"
                scope="col"
              >
                PRICE
              </th>
              <th className="px-3.5 py-2.5 font-medium" scope="col">
                LANDING PAGE
              </th>
              <th className="px-3.5 py-2.5 font-medium" scope="col">
                IN ADS
              </th>
            </tr>
          </thead>
          <tbody className="[font-variant-numeric:tabular-nums]">
            {products.map((product) => (
              <tr
                className="border-b border-[#E9E4D6] last:border-b-0"
                key={product.name}
              >
                <td className="px-3.5 py-2.5 align-top">
                  <b>{product.name}</b>
                </td>
                <td className="px-3.5 py-2.5 align-top">{product.category}</td>
                <td className="px-3.5 py-2.5 text-right align-top">
                  {product.price}
                </td>
                <td
                  className={`px-3.5 py-2.5 align-top ${monoFont} text-xs ${product.landingClass ?? ""}`}
                >
                  {product.landing}
                </td>
                <td className="px-3.5 py-2.5 align-top">
                  {product.ads === "WINNER" ? (
                    <span
                      className={`inline-block bg-[#FF4D1C] px-1.5 py-0.5 ${monoFont} text-[11px] font-bold`}
                    >
                      WINNER
                    </span>
                  ) : (
                    <span
                      className={`${monoFont} text-[11px] ${product.adsClass ?? ""}`}
                    >
                      {product.ads}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
