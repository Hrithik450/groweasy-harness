"use client";

import React, { useEffect } from "react";
import {
  User,
  Settings as SettingsIcon,
  X,
  ExternalLink,
} from "lucide-react";
import { Modal } from "@openai-harness/client-ui-primitives";
import {
  useModalStore,
  useUserStore,
} from "@openai-harness/client-ui-session";

/**
 * Settings surface for the `shell.overlay` seat.
 *
 * Markup and Tailwind classes are the application's existing settings modal,
 * unchanged. The shared `Modal` primitive supplies the portal, Escape close,
 * and focus restore; this component keeps its original backdrop and card.
 */
export function SettingsModal() {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    settingsTab,
    setSettingsTab,
  } = useModalStore();
  const { user } = useUserStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSettingsModalOpen) {
        closeSettingsModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsModalOpen, closeSettingsModal]);

  return (
    <Modal
      open={isSettingsModalOpen}
      onClose={closeSettingsModal}
      title="Settings"
      headless
      className="max-h-none! w-auto! max-w-none! border-0! bg-transparent! p-0!"
    >
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 select-none animate-in fade-in duration-200">
        {/* Backdrop */}
        <div
          onClick={closeSettingsModal}
          className="fixed inset-0 bg-foreground/50 transition-opacity"
        />

        {/* Modal Dialog Window */}
        <div className="relative z-10 w-full max-w-4xl bg-card border border-border rounded-none flex flex-col h-[90dvh] sm:h-[640px] max-h-[90dvh] overflow-hidden text-foreground">
          {/* Top Titlebar */}
          <div className="h-14 px-5 sm:px-6 border-b border-border flex items-center justify-between shrink-0 bg-card">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-foreground">
                Settings
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeSettingsModal}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Modal Body: Left Tab Sidebar + Right Content Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Navigation Sidebar */}
            <div className="w-56 bg-muted border-r border-border p-3 shrink-0 flex flex-col justify-between overflow-y-auto no-scrollbar">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setSettingsTab("account")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-none text-xs font-medium transition-colors cursor-pointer border ${
                    settingsTab === "account"
                      ? "bg-card text-foreground font-semibold border-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary border-transparent"
                  }`}
                >
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>Account</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettingsTab("general")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-none text-xs font-medium transition-colors cursor-pointer border ${
                    settingsTab === "general"
                      ? "bg-card text-foreground font-semibold border-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary border-transparent"
                  }`}
                >
                  <SettingsIcon className="w-4 h-4 text-muted-foreground" />
                  <span>General</span>
                </button>
              </div>
            </div>

            {/* Right Content Pane */}
            <div className="flex-1 overflow-y-auto no-scrollbar bg-card">
              {/* 1. Account Tab */}
              {settingsTab === "account" && (
                <div className="p-6 sm:p-8 max-w-2xl space-y-4">
                  {/* User Card */}
                  <div className="border border-border rounded-none p-4 bg-card flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {user?.picture ? (
                        <img
                          src={user.picture}
                          alt={user.name || "User"}
                          className="w-10 h-10 rounded-none object-cover border border-brand-border"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-none bg-brand-border text-primary-foreground font-bold text-sm flex items-center justify-center overflow-hidden border border-brand-border">
                          {(user?.name || "U")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {user?.name || "Guest User"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {user?.email || "Not signed in"}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>More account information</span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>

                  {/* Additional Settings Info */}
                  <div className="border border-border rounded-none p-4 bg-card space-y-3">
                    <h4 className="text-xs font-semibold text-foreground">
                      Authentication &amp; Session
                    </h4>
                    <div className="text-xs text-muted-foreground space-y-1.5">
                      <div className="flex justify-between py-1 border-b border-border">
                        <span className="text-muted-foreground">User ID</span>
                        <span className="font-mono text-foreground">{user?.id || "anonymous"}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border">
                        <span className="text-muted-foreground">Sign-in Provider</span>
                        <span className="text-foreground font-medium">{user?.googleId ? "Google OAuth" : "Local / Guest"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. General Tab */}
              {settingsTab === "general" && (
                <div className="p-6 sm:p-8 max-w-2xl space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    General Preferences
                  </h3>
                  <div className="border border-border rounded-none p-4 bg-card space-y-3 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Default Agent Execution Speed</span>
                      <span className="text-info font-semibold">
                        Turbo (Low Latency)
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2.5 border-t border-border">
                      <span>Telemetry &amp; Usage Logs</span>
                      <span className="text-muted-foreground">Enabled</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
