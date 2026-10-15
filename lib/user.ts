// The id all data was stored under before multi-user accounts existed.
// When LEGACY_OWNER_EMAIL signs in, that data is moved to their real account (lib/legacy.ts).
export const LEGACY_USER_ID = "0f64105d-5a67-4f2b-b8c9-dd2bdb0c4abc"

export function isOwner(email: string | null | undefined): boolean {
  const owner = process.env.LEGACY_OWNER_EMAIL?.trim().toLowerCase()
  return !!owner && !!email && email.trim().toLowerCase() === owner
}
