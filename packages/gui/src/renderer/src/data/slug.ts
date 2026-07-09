/** Derive the character slug/id from a display name — must match core's create rule. */
export const deriveSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
