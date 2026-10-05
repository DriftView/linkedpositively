import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function PageNotFound() {
  return (
    <Empty className="mx-auto max-w-xl rounded-3xl border border-dashed py-14">
      <EmptyHeader>
        <EmptyMedia className="size-14 rounded-2xl bg-secondary text-primary">
          <FileQuestion className="size-6" />
        </EmptyMedia>
        <EmptyTitle className="text-lg">We couldn&apos;t find that page</EmptyTitle>
        <EmptyDescription>It may have moved. Everything we have is on the Help &amp; info page.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild className="h-10 rounded-full px-5">
          <Link href="/pages">Go to Help &amp; info</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
