/** Reads a required environment variable (Supabase secret); fails loudly when it is missing. */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

/** Reads an optional environment variable; empty values count as missing. */
export function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name) || undefined
}
