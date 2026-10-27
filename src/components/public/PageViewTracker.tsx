"use client";

import { useEffect } from "react";
import { trackPageView } from "@/lib/analytics-client";

export function PageViewTracker() {
  useEffect(() => {
    trackPageView();
  }, []);
  return null;
}
