import { create } from "zustand";
import type { Session } from "@/lib/db";

interface SessionState {
  hydrated: boolean;
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  updateSession: (id: string, updatedSession: Partial<Session>) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  hydrated: false,

  setSessions: (sessions) => set({ sessions, hydrated: true }),

  updateSession: (id, updatedSession) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...updatedSession } : s,
      ),
    })),
}));
