"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { useStore } from "@/lib/store";
import { hydrateSessionById } from "@/lib/persistence";
import { runExtraction, runReconciliation, runLiveDemo } from "@/lib/actions";
import { toast } from "@/lib/toast";

export default function SessionPage() {
  return (
    <Suspense fallback={<SessionLoader />}>
      <SessionInner />
    </Suspense>
  );
}

function SessionLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 font-mono text-[12px] text-paper-faint">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-soft" />
        Loading session…
      </div>
    </div>
  );
}

function SessionInner() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const id = String(params.id || "");
  const started = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const st = useStore.getState();

      // Hydrate from IndexedDB unless the store already holds this session
      // (e.g. we just created it on the home screen).
      if (st.sessionId !== id) {
        const ok = await hydrateSessionById(id);
        if (!ok) {
          setStatus("missing");
          toast("Session not found", "error");
          router.replace("/app");
          return;
        }
      }
      setStatus("ready");

      if (search.get("tab") === "ask") useStore.getState().setActiveTab("ask");

      const run = search.get("run");
      const cur = useStore.getState();
      if (run === "demo" && cur.claims.length === 0) {
        await runExtraction({ demo: true });
        await runReconciliation();
      } else if (run === "live" && cur.claims.length === 0) {
        await runLiveDemo();
      }

      // Clean the run/tab flags from the URL so refresh doesn't re-trigger.
      if (run || search.get("tab")) {
        window.history.replaceState(null, "", `/app/${id}`);
      }
    })();
  }, [id, router, search]);

  if (status === "loading") return <SessionLoader />;

  return <Workspace />;
}
