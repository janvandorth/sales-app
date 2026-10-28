/**
 * The `test` branch on Vercel. Its requests carry TEST_DEPLOYMENT_HEADER, so the backend onboards its sales on
 * ZMAdmin's TEST whichever URL the build was opened on (branch URL or a per-deployment URL).
 */
export const IS_TEST_DEPLOYMENT = import.meta.env.VITE_VERCEL_GIT_COMMIT_REF === "test"

export const TEST_DEPLOYMENT_HEADER = "x-test-deployment"

/** The results page is still being tried out: only on the test deployment and in development. */
export const SHOW_RESULTS = IS_TEST_DEPLOYMENT || import.meta.env.DEV

/** Giving out areas ("Planning", "Mijn gebieden", "Toewijzen" on the map) is tried out in the same places. */
export const SHOW_AREAS = SHOW_RESULTS
