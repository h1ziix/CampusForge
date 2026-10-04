/**
 * ActionResult<T> -- standard return type for all server actions in CampusForge.
 *
 * Every server action returns this shape. Components check `success` before
 * accessing `data`. This avoids throwing errors across the server/client boundary.
 */
export type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string };

/**
 * Helper to create a success result.
 */
export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

/**
 * Helper to create a failure result.
 */
export function err(error: string): ActionResult<never> {
  return { success: false, error };
}
