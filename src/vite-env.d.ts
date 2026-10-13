/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** Set by Vercel: the git branch of this deployment ("test" for the test deployment). */
  readonly VITE_VERCEL_GIT_COMMIT_REF?: string
}
