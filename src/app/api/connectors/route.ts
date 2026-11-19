import { NextRequest, NextResponse } from "next/server";
import { getConnectorsByUserId } from "@/lib/services";
import { getAuthSessionFromRequest } from "@/lib/auth/session";
import {
  AVAILABLE_CONNECTORS,
  toBrowserConnector,
  type Connector,
} from "@/lib/connectors/registry";
import { reconcileSyncStatus } from "@/lib/connectors/sync.reconcile";

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
      (row) => reconcileSyncStatus(row),
    );
    const rowBySlug = new Map(rows.map((row) => [row.slug, row]));

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
