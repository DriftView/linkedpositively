"use client";

import { ErrorPanel } from "@/features/peer-nav/components/error-panel";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorPanel retry={retry} rounded />;
}
