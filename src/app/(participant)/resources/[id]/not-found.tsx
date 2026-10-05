import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function ResourceNotFound() {
  return (
    <Empty className="mx-auto max-w-xl rounded-3xl border border-dashed py-14">
      <EmptyHeader>
        <EmptyMedia className="size-14 rounded-2xl bg-secondary text-primary">
          <MapPinOff className="size-6" />
        </EmptyMedia>
        <EmptyTitle className="text-lg">This resource isn&apos;t available</EmptyTitle>
        <EmptyDescription>It may have closed or been removed from the directory.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild className="h-10 rounded-full px-5">
          <Link href="/resources">Find other resources</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
