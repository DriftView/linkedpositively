import { TipsSkeleton } from "@/features/tips/components/tips-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl pt-12">
      <TipsSkeleton rows={2} />
    </div>
  );
}
