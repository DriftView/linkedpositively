import { getPendingCelebration } from "../queries";
import { LevelUpCelebration } from "./level-up-celebration";

/**
 * Drop-in for layouts: shows the level-up celebration when the viewer has
 * an unseen level-up. Renders nothing otherwise.
 */
export async function LevelUpGate({ userId }: { userId: string }) {
  const pending = await getPendingCelebration(userId);
  return pending ? <LevelUpCelebration pending={pending} /> : null;
}
