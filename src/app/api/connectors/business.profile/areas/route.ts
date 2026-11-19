import { NextRequest, NextResponse } from "next/server";
import path from "path";
import zlib from "zlib";
import fs from "fs";

interface PostalRecord {
  c?: string; // Circle
  r?: string; // Region
  v?: string; // Division
  o?: string; // Office name (Area)
  p?: string; // Pincode
  t?: string; // Type (BO, SO, HO)
  d?: number; // Delivery
  i?: string; // District
  s?: string; // State
}

let cachedRecords: PostalRecord[] | null = null;

function loadPostalRecords(): PostalRecord[] {
  if (cachedRecords) return cachedRecords;

  const candidatePaths = [
    (() => {
      try {
        return path.resolve(
          path.dirname(require.resolve("india-pincode")),
          "..",
          "data",
          "pincodes.json.gz",
        );
      } catch {
        return null;
      }
    })(),
    path.join(
      process.cwd(),
      "node_modules/india-pincode/data/pincodes.json.gz",
    ),
    (() => {
      try {
        return path.resolve(
          path.dirname(require.resolve("india-pincode")),
          "..",
          "data",
          "pincodes.json",
        );
      } catch {
        return null;
      }
    })(),
    path.join(process.cwd(), "node_modules/india-pincode/data/pincodes.json"),
  ].filter(Boolean) as string[];

  let loaded: PostalRecord[] | null = null;

  for (const filePath of candidatePaths) {
    if (fs.existsSync(filePath)) {
      if (filePath.endsWith(".gz")) {
        const compressed = fs.readFileSync(filePath);
        const decompressed = zlib.gunzipSync(compressed);
        loaded = JSON.parse(decompressed.toString("utf-8"));
        break;
      } else {
        const text = fs.readFileSync(filePath, "utf-8");
        loaded = JSON.parse(text);
        break;
      }
    }
  }

  if (!loaded || !Array.isArray(loaded)) {
    throw new Error(
      "India postal dataset could not be located in candidate paths.",
    );
  }

  cachedRecords = loaded;
  return cachedRecords;
}

const ALIAS_MAP: Record<string, string[]> = {
  bangalore: ["bengaluru", "bangalore"],
  bengaluru: ["bengaluru", "bangalore"],
  "bangalore urban": ["bengaluru urban", "bangalore urban"],
  "bangalore rural": ["bengaluru rural", "bangalore rural"],
  "bengaluru urban": ["bengaluru urban", "bangalore urban"],
  "bengaluru rural": ["bengaluru rural", "bangalore rural"],
  calcutta: ["kolkata", "calcutta"],
  kolkata: ["kolkata", "calcutta"],
  madras: ["chennai", "madras"],
  chennai: ["chennai", "madras"],
  bombay: ["mumbai", "bombay"],
  mumbai: ["mumbai", "mumbai city", "mumbai suburban"],
  "mumbai city": ["mumbai city", "mumbai"],
  "mumbai suburban": ["mumbai suburban", "mumbai"],
  mysore: ["mysuru", "mysore"],
  mysuru: ["mysuru", "mysore"],
  gurgaon: ["gurugram", "gurgaon"],
  gurugram: ["gurugram", "gurgaon"],
  pondicherry: ["puducherry", "pondicherry"],
  puducherry: ["puducherry", "pondicherry"],
  poona: ["pune", "poona"],
  pune: ["pune", "poona"],
  baroda: ["vadodara", "baroda"],
  vadodara: ["vadodara", "baroda"],
  cochin: ["ernakulam", "kochi", "cochin"],
  kochi: ["ernakulam", "kochi", "cochin"],
  trivandrum: ["thiruvananthapuram", "trivandrum"],
  thiruvananthapuram: ["thiruvananthapuram", "trivandrum"],
  belgaum: ["belagavi", "belgaum"],
  belagavi: ["belagavi", "belgaum"],
  bellary: ["ballari", "bellary"],
  ballari: ["ballari", "bellary"],
  hubli: ["dharwad", "hubli", "hubballi"],
  hubballi: ["dharwad", "hubli", "hubballi"],
  mangalore: ["dakshina kannada", "mangalore", "mangaluru"],
  mangaluru: ["dakshina kannada", "mangalore", "mangaluru"],
  shimoga: ["shivamogga", "shimoga"],
  shivamogga: ["shivamogga", "shimoga"],
  bijapur: ["vijayapura", "bijapur"],
  vijayapura: ["vijayapura", "bijapur"],
  gulbarga: ["kalaburagi", "gulbarga"],
  kalaburagi: ["kalaburagi", "gulbarga"],
};

function cleanArea(rawArea: string): string {
  if (!rawArea) return "";
  return rawArea
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+[BSH]\.O\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city") || "";
  const state = searchParams.get("state") || "";

  if (!city.trim()) {
    return NextResponse.json({ success: true, areas: [] });
  }

  try {
    const records = loadPostalRecords();
    const normCity = city.trim().toLowerCase();
    const normState = state ? state.trim().toLowerCase() : "";

    const targets = (ALIAS_MAP[normCity] || [normCity]).map((t) =>
      t.toLowerCase(),
    );

    const executeFilter = (applyState: boolean) => {
      const areaSet = new Set<string>();

      for (const item of records) {
        if (!item.o || !item.i || item.i === "NA") continue;

        if (applyState && normState && item.s && item.s !== "NA") {
          const itemState = item.s.toLowerCase();
          if (
            itemState !== normState &&
            !itemState.includes(normState) &&
            !normState.includes(itemState)
          ) {
            continue;
          }
        }

        const dist = item.i.toLowerCase().trim();
        const isMatch = targets.some((t) => {
          if (dist === t) return true;
          if (dist === t + " district" || t === dist + " district") return true;
          if (dist.startsWith(t + " ") || dist.endsWith(" " + t)) return true;
          return false;
        });

        if (isMatch) {
          const cleaned = cleanArea(item.o);
          if (cleaned) areaSet.add(cleaned);
        }
      }

      return Array.from(areaSet).sort((a, b) => a.localeCompare(b));
    };

    let results = executeFilter(true);
    // If state filter yielded 0 results, retry without state filter
    if (results.length === 0 && normState) {
      results = executeFilter(false);
    }

    // If still 0 results (e.g. user selected a sub-town not in district list), search offices directly
    if (results.length === 0) {
      const fallbackSet = new Set<string>();
      for (const item of records) {
        if (!item.o || item.o === "NA") continue;
        const cleaned = cleanArea(item.o);
        if (
          cleaned.toLowerCase().includes(normCity) ||
          normCity.includes(cleaned.toLowerCase())
        ) {
          fallbackSet.add(cleaned);
        }
      }
      results = Array.from(fallbackSet).sort((a, b) => a.localeCompare(b));
    }

    return NextResponse.json({
      success: true,
      areas: results,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, areas: [], error: String(error) },
      { status: 500 },
    );
  }
}
