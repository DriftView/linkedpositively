"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { recordPageViewAction } from "../actions";

/** Records the view once; celebrates the one-time guidelines points. */
export function PageViewTracker({ slug }: { slug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void recordPageViewAction({ slug }).then((result) => {
      if (result?.data?.awarded) {
        toast.success(`+${result.data.points} points`, { description: "Thanks for reading the community guidelines!" });
      }
    });
  }, [slug]);
  return null;
}
