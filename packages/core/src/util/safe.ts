/** Await fn(), swallowing failure into a fallback — for machine probes that may not exist. */
export async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}
