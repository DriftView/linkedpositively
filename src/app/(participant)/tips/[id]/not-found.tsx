import { SearchX } from "lucide-react";
import { TipsEmpty } from "@/features/tips/components/tips-empty";

export default function TipNotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl pt-8">
      <TipsEmpty
        icon={SearchX}
        title="We couldn't find that tip"
        description="It may not be available to you yet, or it has been taken down."
        action={{ href: "/tips", label: "Back to your tips" }}
      />
    </div>
  );
}
