import { NextRequest, NextResponse } from "next/server";
import { getConnectorsByUserId } from "@/lib/services";
import { getAuthSessionFromRequest } from "@/lib/auth";
import {
  AVAILABLE_CONNECTORS,
  toBrowserConnector,
  type Connector,
} from "@/lib/connectors/registry";
import { reconcileStatus } from "@/lib/connectors/reconcile";

/**
 * GET /api/connectors
 *
 * Returns the full catalogue in display order, with the caller's connection
 * state layered on. A user who has never connected anything still sees every
 * available connector, which is what the manager renders before any connection
 * exists; the database only supplies the state, never the list itself.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = ((await getConnectorsByUserId(user.id)).data ?? []).map(
      (row) => reconcileStatus(row),
    );
    // One display row per slug: the primary instance, else the newest.
    const rowBySlug = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const current = rowBySlug.get(row.slug);
      if (
        current === undefined ||
        (row.isPrimary && !current.isPrimary) ||
        (row.isPrimary === current.isPrimary &&
          row.updatedAt > current.updatedAt)
      ) {
        rowBySlug.set(row.slug, row);
      }
    }

    const connectors: Connector[] = AVAILABLE_CONNECTORS.map((definition) => {
      const row = rowBySlug.get(definition.slug);
      if (row === undefined) return definition;
      // The row owns connection state; the catalogue owns presentation.
      // `toBrowserConnector` drops credentials before they reach the client.
      return {
        ...definition,
        ...toBrowserConnector(row as unknown as Record<string, unknown>),
        slug: row.slug as Connector["slug"],
      };
    });

    // A row whose slug left the catalogue still belongs to the user; surface it
    // with its stored name rather than dropping a live connection.
    for (const row of rows) {
      if (connectors.some((connector) => connector.slug === row.slug)) continue;
      connectors.push({
        ...row,
        slug: row.slug as Connector["slug"],
        // Rows predating the provider enum may still store legacy ids.
        providerSlug: row.providerSlug as Connector["providerSlug"],
        name: row.slug,
        icon: "",
        description: "",
        isAvailable: true,
      });
    }

    return NextResponse.json({ connectors });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
