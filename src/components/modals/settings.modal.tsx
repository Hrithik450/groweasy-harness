"use client";

import React, { useEffect } from "react";
import {
  User,
  Settings as SettingsIcon,
  X,
  ExternalLink,
} from "lucide-react";
import { useModalStore } from "@/store/modal.store";
import { useUserStore } from "@/store/user.store";
import { ModalPortal } from "./modal.portal";

export function SettingsModal() {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    settingsTab,
    setSettingsTab,
  } = useModalStore();
  const { user } = useUserStore();
  const activeTab = settingsTab.startsWith("business") ? "account" : settingsTab;


  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSettingsModalOpen) {
        closeSettingsModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsModalOpen, closeSettingsModal]);

  if (!isSettingsModalOpen) return null;

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-4 select-none animate-in fade-in duration-200"
      >
      {/* Backdrop */}
      <div
        onClick={closeSettingsModal}
        className="fixed inset-0 bg-foreground/50 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Dialog Window */}
      <div className="relative z-10 w-full max-w-5xl bg-card border border-border/90 rounded-2xl shadow-2xl flex flex-col h-[90dvh] sm:h-[680px] max-h-[90dvh] overflow-hidden text-foreground">
        {/* Top Titlebar */}
        <div className="h-14 px-5 sm:px-6 border-b border-border-subtle flex items-center justify-between shrink-0 bg-card">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-foreground">
              Settings
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeSettingsModal}
              className="p-1.5 text-muted-2 hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Left Tab Sidebar + Right Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Sidebar */}
          <div className="w-60 bg-linen/70 border-r border-border-subtle p-3 shrink-0 flex flex-col justify-between overflow-y-auto no-scrollbar">
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSettingsTab("account")}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === "account"
                    ? "bg-card text-foreground font-semibold shadow-2xs border-border/80"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/70"
                }`}
              >
                <User className="w-4 h-4 text-muted-foreground" />
                <span>Account</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsTab("general")}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === "general"
                    ? "bg-card text-foreground font-semibold shadow-2xs border-border/80"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/70"
                }`}
              >
                <SettingsIcon className="w-4 h-4 text-muted-foreground" />
                <span>General</span>
              </button>

            </div>
          </div>

          {/* Right Content Pane */}
          <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar bg-card">
            {/* 1. Account Tab */}
            {activeTab === "account" && (
              <div className="w-full space-y-4 px-6 sm:px-8 pt-3 sm:pt-4 pb-6 sm:pb-8">
                {/* User Card */}
                <div className="border border-border/90 rounded-2xl p-4 bg-card shadow-2xs flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {user?.picture ? (
                      <img
                        src={user.picture}
                        alt={user.name || "User"}
                        className="w-10 h-10 rounded-full object-cover border border-forest shadow-xs"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-forest text-primary-foreground font-bold text-sm flex items-center justify-center overflow-hidden border border-forest">
                        {(user?.name || "U")[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {user?.name || "Guest User"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {user?.email || "Not signed in"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>More account information</span>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-2" />
                  </button>
                </div>

                {/* Topped-up balance Card */}
                <div className="border border-border/90 rounded-2xl p-5 bg-card shadow-2xs space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">
                      Topped-up balance
                    </span>
                    <span className="text-lg font-bold text-foreground font-mono">
                      $0.00
                    </span>
                  </div>

                  <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
                    <span className="text-xs text-muted-2">More</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="px-3.5 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:text-foreground hover:bg-linen transition-colors cursor-pointer shadow-2xs"
                      >
                        View usage
                      </button>
                      <button
                        type="button"
                        className="px-4 py-1.5 rounded-lg bg-forest hover:bg-forest-strong text-primary-foreground text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        Top up
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. General Tab */}
            {activeTab === "general" && (
              <div className="w-full space-y-4 px-6 sm:px-8 pt-3 sm:pt-4 pb-6 sm:pb-8">
                <h3 className="text-sm font-semibold text-foreground">
                  General Preferences
                </h3>
                <div className="border border-border/90 rounded-2xl p-4 bg-card shadow-2xs space-y-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">Default Agent Execution Speed</span>
                    <span className="shrink-0 text-info-strong font-semibold">
                      Turbo (Low Latency)
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border-subtle">
                    <span className="min-w-0 truncate">Telemetry &amp; Usage Logs</span>
                    <span className="shrink-0 text-muted-foreground">Enabled</span>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}
