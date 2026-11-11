import test from "node:test";
import assert from "node:assert/strict";

import { useSessionStore } from "../src/store/session.store";
import { useSidebarStore } from "../src/store/sidebar.store";
import { useModalStore } from "../src/store/modal.store";
import { useConnectorStore } from "../src/store/connector.store";
import { useUserStore } from "../src/store/user.store";
import { AVAILABLE_CONNECTORS } from "../src/types/connectors";

test("session store keeps its shape and session actions", () => {
  useSessionStore.setState({
    sessions: [],
    hydrated: false,
    streamingSessions: {},
  });

  const session = {
    id: "s1",
    userId: "u1",
    title: "First",
    slug: null,
    hidden: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  useSessionStore.getState().setSessions([session]);
  assert.equal(useSessionStore.getState().hydrated, true);
  assert.equal(useSessionStore.getState().sessions.length, 1);

  useSessionStore.getState().addSession({ ...session, id: "s2", title: "Second" });
  assert.deepEqual(
    useSessionStore.getState().sessions.map((item) => item.id),
    ["s2", "s1"],
  );

  useSessionStore.getState().updateSession("s1", { title: "Renamed" });
  assert.equal(
    useSessionStore.getState().sessions.find((item) => item.id === "s1")?.title,
    "Renamed",
  );

  useSessionStore.getState().setStreamingSession("s1", true);
  assert.equal(useSessionStore.getState().streamingSessions["s1"], true);
  useSessionStore.getState().setStreamingSession("s1", false);
  assert.equal("s1" in useSessionStore.getState().streamingSessions, false);
});

test("sidebar store toggles left, right, and mobile state", () => {
  useSidebarStore.setState({
    isLeftCollapsed: false,
    isRightCollapsed: false,
    isMobileOpen: false,
  });

  useSidebarStore.getState().toggleLeftCollapsed();
  useSidebarStore.getState().toggleRightCollapsed();
  useSidebarStore.getState().toggleMobile();
  assert.deepEqual(
    {
      left: useSidebarStore.getState().isLeftCollapsed,
      right: useSidebarStore.getState().isRightCollapsed,
      mobile: useSidebarStore.getState().isMobileOpen,
    },
    { left: true, right: true, mobile: true },
  );

  useSidebarStore.getState().setLeftCollapsed(false);
  useSidebarStore.getState().setRightCollapsed(false);
  useSidebarStore.getState().closeMobile();
  assert.deepEqual(
    {
      left: useSidebarStore.getState().isLeftCollapsed,
      right: useSidebarStore.getState().isRightCollapsed,
      mobile: useSidebarStore.getState().isMobileOpen,
    },
    { left: false, right: false, mobile: false },
  );
});

test("modal store opens session, settings, and lightbox surfaces", () => {
  useModalStore.setState({
    isNewSessionModalOpen: false,
    isSettingsModalOpen: false,
    settingsTab: "account",
    lightbox: { isOpen: false, images: [], index: 0 },
  });

  useModalStore.getState().openNewSessionModal();
  assert.equal(useModalStore.getState().isNewSessionModalOpen, true);
  useModalStore.getState().closeNewSessionModal();
  assert.equal(useModalStore.getState().isNewSessionModalOpen, false);

  useModalStore.getState().openSettingsModal("models");
  assert.equal(useModalStore.getState().isSettingsModalOpen, true);
  assert.equal(useModalStore.getState().settingsTab, "models");
  useModalStore.getState().setSettingsTab("presets");
  assert.equal(useModalStore.getState().settingsTab, "presets");
  useModalStore.getState().closeSettingsModal();
  assert.equal(useModalStore.getState().isSettingsModalOpen, false);

  const images = [{ src: "/one.png", alt: "One" }];
  useModalStore.getState().openLightbox(images, 0);
  assert.deepEqual(useModalStore.getState().lightbox, {
    isOpen: true,
    images,
    index: 0,
  });
  useModalStore.getState().closeLightbox();
  assert.equal(useModalStore.getState().lightbox.isOpen, false);
});

test("connector store merges catalog defaults with user connectors", () => {
  useConnectorStore.setState({
    isModalOpen: false,
    activeManagerSlug: null,
    connectors: AVAILABLE_CONNECTORS,
  });

  useConnectorStore.getState().openModal();
  useConnectorStore.getState().openManager("metaAds");
  assert.equal(useConnectorStore.getState().isModalOpen, true);
  assert.equal(useConnectorStore.getState().activeManagerSlug, "metaAds");
  useConnectorStore.getState().closeModal();
  assert.equal(useConnectorStore.getState().isModalOpen, false);
  assert.equal(useConnectorStore.getState().activeManagerSlug, null);

  useConnectorStore.getState().setConnectors([
    {
      id: "c1",
      slug: "shopify",
      providerSlug: "shopify",
      status: "connected",
      metadata: { shop: "example" },
    },
  ]);

  const afterMerge = useConnectorStore.getState().connectors;
  const shopify = afterMerge.find((item) => item.slug === "shopify");
  assert.equal(shopify?.id, "c1");
  assert.equal(shopify?.status, "connected");
  assert.deepEqual(shopify?.metadata, { shop: "example" });
  assert.equal(
    afterMerge.find((item) => item.slug === "metaAds")?.status,
    "disconnected",
  );

  useConnectorStore.getState().updateConnector("metaAds", { status: "expired" });
  assert.equal(
    useConnectorStore
      .getState()
      .connectors.find((item) => item.slug === "metaAds")?.status,
    "expired",
  );
});

test("user store starts signed out and exposes logout", () => {
  useUserStore.setState({ user: null, isLoading: false });
  assert.equal(useUserStore.getState().user, null);
  assert.equal(useUserStore.getState().isLoading, false);
  assert.equal(typeof useUserStore.getState().logout, "function");
});
