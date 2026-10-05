import { TableSkeleton } from "@/features/admin/components/skeletons";

export default function Loading() {
  return <TableSkeleton title rows={10} />;
}
