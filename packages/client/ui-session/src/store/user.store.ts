"use client";

import { create } from "zustand";
import type { UserView } from "@openai-harness/session";
import { getClientSessionDependencies } from "../config";

interface UserState {
  user: UserView | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoading: false,
  logout: async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("anonymous_user_id");
      }
      const dependencies = getClientSessionDependencies();
      const fetchImpl = dependencies.fetch ?? globalThis.fetch;
      await fetchImpl(dependencies.logoutUrl ?? "/api/auth/logout", {
        method: "POST",
      });
    } catch (err) {
      console.error("Failed to logout:", err);
    } finally {
      set({ user: null, isLoading: false });
      window.location.href = "/";
    }
  },
}));
