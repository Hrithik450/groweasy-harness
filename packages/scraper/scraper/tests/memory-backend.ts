/**
 * Minimal in-memory storage backend for scraper tests.
 *
 * The storage-domain test helper lives under another package's `tests/`
 * directory and is not part of its exported surface, so this package carries
 * the small subset its pipeline tests need: version stamping, opaque JSON
 * records, and per-call durability.
 *
 * @module
 */

import type {
  KvFacet,
  KvUnit,
  KvUnitDescriptor,
  StorageBackend,
} from "@openai-harness/storage";

interface MemoryMedium {
  version: number;
  tables: Map<string, Map<string, unknown>>;
  global: unknown;
  open: boolean;
}

/** Storage backend holding every unit in process memory. */
export class MemoryStorageBackend implements StorageBackend {
  private readonly media = new Map<string, MemoryMedium>();

  readonly kv: KvFacet = {
    open: async (descriptor) => this.openUnit(descriptor),
  };

  private openUnit(descriptor: KvUnitDescriptor): KvUnit {
    const existing = this.media.get(descriptor.name);
    if (existing?.open === true) {
      throw new Error(`kv unit '${descriptor.name}' is already open`);
    }
    if (existing !== undefined && existing.version !== descriptor.version) {
      throw new Error(
        `kv unit '${descriptor.name}' is stamped version ${existing.version}, descriptor wants ${descriptor.version}`,
      );
    }

    const medium: MemoryMedium = existing ?? {
      version: descriptor.version,
      tables: new Map<string, Map<string, unknown>>(),
      global: null,
      open: false,
    };
    for (const table of descriptor.tables) {
      if (!medium.tables.has(table)) medium.tables.set(table, new Map());
    }
    medium.open = true;
    this.media.set(descriptor.name, medium);

    return {
      loadAll: async () => ({
        tables: Object.fromEntries(
          [...medium.tables].map(([table, records]) => [
            table,
            Object.fromEntries(records),
          ]),
        ),
        global: medium.global,
      }),
      putRecord: async (table, key, value) => {
        const records = medium.tables.get(table);
        if (records === undefined) {
          throw new Error(`unit '${descriptor.name}' has no table '${table}'`);
        }
        records.set(key, structuredClone(value));
      },
      deleteRecord: async (table, key) => {
        medium.tables.get(table)?.delete(key);
      },
      setGlobal: async (value) => {
        medium.global = structuredClone(value);
      },
      close: async () => {
        medium.open = false;
      },
    };
  }

  async close(): Promise<void> {
    for (const medium of this.media.values()) medium.open = false;
  }
}
