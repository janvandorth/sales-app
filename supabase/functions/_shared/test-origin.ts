import { optionalEnv } from "./env.ts"
import { originPatterns } from "./http.ts"

/**
 * Origins of the test deployment (TEST_ORIGINS, same format as ALLOWED_ORIGINS). Sales sent from there are stored
 * with test = true: onboarded on test.zekerenmobiel.nl and kept out of the Google Sheet.
 */
const testOrigins = originPatterns(optionalEnv("TEST_ORIGINS") ?? "")

export function isTestOrigin(req: Request): boolean {
  const origin = req.headers.get("Origin") ?? ""
  return testOrigins.some((pattern) => pattern.test(origin))
}
