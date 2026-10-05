import { redirect } from "next/navigation";
import { homePathFor } from "@/server/auth/roles";
import { getViewer } from "@/server/auth/session";

/** Post-login landing: sends each user to their role's home page (see homePathFor). */
export async function GET() {
  const viewer = await getViewer();
  redirect(viewer ? homePathFor(viewer.roles) : "/login");
}
