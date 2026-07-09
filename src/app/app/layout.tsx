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
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="min-w-0 flex-1">{children}</div>
      <Toaster />
    </div>
  );
}
