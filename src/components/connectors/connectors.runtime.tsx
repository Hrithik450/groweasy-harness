"use client";

import { ConnectorStream } from "./connector.stream";
import { ConnectorsModal } from "@/components/modals/connectors/connectors.modal";

export function ConnectorsRuntime() {
  return (
    <>
      <ConnectorStream />
      <ConnectorsModal />
    </>
  );
}
