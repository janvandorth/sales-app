/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /**
   * Folder with the sales map's pc4/pc5/pc6.pmtiles (scripts/build-postcode-tiles.mjs). Unset: the public Storage
   * bucket postcode-tiles of VITE_SUPABASE_URL.
   */
  readonly VITE_POSTCODE_TILES_URL?: string
  /** Set by Vercel: the git branch of this deployment ("test" for the test deployment). */
  readonly VITE_VERCEL_GIT_COMMIT_REF?: string
}
