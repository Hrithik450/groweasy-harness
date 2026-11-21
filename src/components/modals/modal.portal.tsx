"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSidebarStore } from "@/store/sidebar.store";

/**
 * Mounts modal overlays on `document.body`.
 *
 * The app shell is a flex container with `overflow-hidden`, and the chat,
 * sidebar, and detail drawer each own stacking contexts. Rendering in place
 * lets those layers win; a body-level portal always paints above them.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // A mobile drawer must never sit above an open modal.
    useSidebarStore.getState().closeMobile();
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
