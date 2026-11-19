"use client";

import { toast } from "sonner";
import React, { useEffect } from "react";
import type { Session, User, ConnectorSlug } from "@/lib/db";
import { Sidebar } from "@/components/sidebar/sidebar";
import { SettingsModal } from "@/components/modals/settings.modal";
import { ImageboxModal } from "@/components/modals/image.lightbox.modal";
import { ConnectorsRuntime } from "@/components/connectors/connectors.runtime";
import { useSessionStore } from "@/store/session.store";
import { useUserStore } from "@/store/user.store";
import { useConnectorStore } from "@/store/connector.store";

interface AppShellProps {
  initialSessions: Session[];
  initialUser?: User | null;
  children: React.ReactNode;
}

export function AppShell({
  initialSessions,
  initialUser,
  children,
}: AppShellProps) {
  const hydrated = useSessionStore((state) => state.hydrated);

  if (!hydrated) {
    useSessionStore.getState().setSessions(initialSessions ?? []);
  }

  if (initialUser) {
    const currentUser = useUserStore.getState().user;
    if (!currentUser || currentUser.id !== initialUser.id) {
      useUserStore.setState({ user: initialUser, isLoading: false });
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const err = params.get("error");
    const openConnector = params.get("open_connector");

    if (err) {
      let displayMsg = err;
      try {
        displayMsg = decodeURIComponent(err);
      } catch {
        displayMsg = err;
      }
      toast.error(displayMsg);
    }

    if (openConnector) {
      useConnectorStore.getState().openModal();
      useConnectorStore.getState().openManager(openConnector as ConnectorSlug);
    }
  }, []);

  return (
    <main className="h-screen w-screen flex overflow-hidden bg-background">
      <Sidebar initialUser={initialUser} initialSessions={initialSessions} />

      <div className="flex-1 flex h-full min-w-0 bg-background overflow-hidden">
        {children}
      </div>

      <SettingsModal />
      <ImageboxModal />
      <ConnectorsRuntime />
    </main>
  );
}
