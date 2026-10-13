import { optionalEnv } from "./env.ts"
import { originPatterns } from "./http.ts"

/**
 * Whether a request comes from the test deployment: the test build sends the x-test-deployment header (from any
 * URL Vercel serves it on), and its branch URL is in TEST_ORIGINS (same format as ALLOWED_ORIGINS) as a fallback.
 * Sales from there are stored with test = true: onboarded on test.zekerenmobiel.nl and kept out of the Google Sheet.
 */
const testOrigins = originPatterns(optionalEnv("TEST_ORIGINS") ?? "")

export function isTestRequest(req: Request): boolean {
  if (req.headers.get("x-test-deployment") === "1") return true
  const origin = req.headers.get("Origin") ?? ""
  return testOrigins.some((pattern) => pattern.test(origin))
}
