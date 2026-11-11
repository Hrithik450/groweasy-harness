import { create } from "zustand";
import type { SessionView } from "@openai-harness/session";

interface SessionState {
  hydrated: boolean;
  sessions: SessionView[];
  streamingSessions: Record<string, boolean>;
  setSessions: (sessions: SessionView[]) => void;
  addSession: (session: SessionView) => void;
  updateSession: (id: string, updatedSession: Partial<SessionView>) => void;
  setStreamingSession: (sessionId: string, isStreaming: boolean) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  hydrated: false,
  streamingSessions: {},

  setSessions: (sessions) => set({ sessions, hydrated: true }),

  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
    })),

  updateSession: (id, updatedSession) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...updatedSession } : s,
      ),
    })),

  setStreamingSession: (sessionId, isStreaming) =>
    set((state) => {
      const updated = { ...state.streamingSessions };
      if (isStreaming) {
        updated[sessionId] = true;
      } else {
        delete updated[sessionId];
      }
      return { streamingSessions: updated };
    }),
}));
