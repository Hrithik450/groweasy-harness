"use client";

import { create } from "zustand";
import type { UserRecord } from "@/lib/db";

interface UserState {
  user: UserRecord | null;
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
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Failed to logout:", err);
    } finally {
      set({ user: null, isLoading: false });
      window.location.href = "/";
    }
  },
}));
