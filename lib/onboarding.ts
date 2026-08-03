import { getSettings } from "./settings";

/**
 * A run that has never been set up. Every screen that shows plan numbers checks
 * this, because a corridor drawn against defaults you never chose is worse than
 * no corridor at all — it looks like data.
 *
 * SETTINGS is deliberately not gated: if something goes wrong in setup, the
 * screen that can fix it has to stay reachable.
 */
export function needsOnboarding(): boolean {
  return getSettings().onboardedAt === null;
}
