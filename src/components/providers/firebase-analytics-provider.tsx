"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Analytics } from "firebase/analytics";

import { getFirebaseClientApp, isFirebaseConfigured } from "@/lib/firebase/client";

export function FirebaseAnalyticsProvider() {
  const pathname = usePathname();
  const analyticsRef = useRef<Analytics | null>(null);
  const [isAnalyticsReady, setIsAnalyticsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initializeFirebaseAnalytics() {
      if (!isFirebaseConfigured()) {
        return;
      }

      const app = getFirebaseClientApp();

      if (!app) {
        return;
      }

      const analyticsModule = await import("firebase/analytics");

      if (!(await analyticsModule.isSupported())) {
        return;
      }

      if (cancelled) {
        return;
      }

      analyticsRef.current = analyticsModule.getAnalytics(app);
      setIsAnalyticsReady(true);
    }

    void initializeFirebaseAnalytics();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function trackRouteChange() {
      if (!pathname || !isFirebaseConfigured()) {
        return;
      }

      if (!analyticsRef.current) {
        return;
      }

      const { logEvent } = await import("firebase/analytics");

      if (cancelled) {
        return;
      }

      logEvent(analyticsRef.current, "page_view", {
        page_path: pathname,
        page_title: document.title,
        page_location: window.location.href,
      });
    }

    void trackRouteChange();

    return () => {
      cancelled = true;
    };
  }, [isAnalyticsReady, pathname]);

  return null;
}
