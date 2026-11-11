"use client";

import { useState, useEffect } from "react";
import { getClientSessionDependencies } from "../config";
import type { Connector } from "../types/connectors";

export function normalizeDomainOrUrl(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return (parsed.hostname + parsed.pathname)
      .toLowerCase()
      .replace(/\/+$/, "");
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

let cachedConnector: Connector | null | undefined = undefined;
let pendingFetch: Promise<Connector | null> | null = null;

async function fetchBusinessProfileConnector(): Promise<Connector | null> {
  if (pendingFetch) return pendingFetch;

  pendingFetch = (async () => {
    try {
      const dependencies = getClientSessionDependencies();
      const fetchImpl = dependencies.fetch ?? globalThis.fetch;
      const res = await fetchImpl(
        dependencies.businessProfileUrl ?? "/api/connectors/business.profile",
      );
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      const connector = (data.connector as Connector) ?? null;
      cachedConnector = connector;
      return connector;
    } catch {
      return null;
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}

export interface UseBusinessProfileResult {
  connector: Connector | null;
  isLoading: boolean;
}

export function useBusinessProfile(): UseBusinessProfileResult {
  const [connector, setConnector] = useState<Connector | null>(
    cachedConnector !== undefined ? cachedConnector : null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    cachedConnector === undefined,
  );

  useEffect(() => {
    if (cachedConnector === undefined) {
      fetchBusinessProfileConnector().then((data) => {
        setConnector(data);
        setIsLoading(false);
      });
    }
  }, []);

  return {
    connector,
    isLoading,
  };
}
