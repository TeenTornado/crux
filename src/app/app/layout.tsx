"use client";

import { useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Toaster } from "@/components/Toaster";
import { useStore } from "@/lib/store";
import { loadPrefs } from "@/lib/prefs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Load persisted UI prefs once for the whole /app section.
  useEffect(() => {
    useStore.getState().applyPrefs(loadPrefs());
    // Preload the local Gemma model the moment the app opens (fire-and-forget),
    // so it's resident before the user hits "Load demo corpus" — this is what
    // turns a cold 17-min first extract into a warm ~2.5s one.
    fetch("/api/warmup", { method: "POST", cache: "no-store" }).catch(() => {});
  }, []);

  return (
    // h-dvh (not h-screen): 100vh on iOS Safari includes the URL bar and clips
    // the bottom of the app; dvh tracks the actual visible viewport.
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar />
      <div className="min-w-0 flex-1">{children}</div>
      <Toaster />
    </div>
  );
}
