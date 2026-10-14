/**
 * True when Supabase/PostgREST reports a table or column that doesn't exist yet —
 * i.e. supabase/migrations/20261014_web_features.sql hasn't been run.
 * Lets new routes degrade gracefully instead of 500-ing.
 */
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return (
    error.code === "42P01" || // undefined_table
    error.code === "42703" || // undefined_column
    error.code === "PGRST205" || // table not in schema cache
    error.code === "PGRST204" || // column not in schema cache
    /does not exist|schema cache/i.test(error.message ?? "")
  )
}

export const MIGRATION_HINT = "Run supabase/migrations/20261014_web_features.sql in the Supabase SQL editor to enable this feature."
