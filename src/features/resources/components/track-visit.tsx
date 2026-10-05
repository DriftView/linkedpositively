"use client";

import { useEffect, useRef } from "react";
import { recordResourceVisitAction } from "../actions";

/**
 * Records a visit once per mount (usage report + the daily locator points).
 * Done from the client so link prefetches don't count as visits.
 */
export function TrackVisit({ resourceId }: { resourceId?: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void recordResourceVisitAction({ resourceId });
  }, [resourceId]);
  return null;
}
