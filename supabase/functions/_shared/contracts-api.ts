import { optionalEnv } from "./env.ts"

// Endpoints of the Zeker en Mobiel Contracts API. Onboarding has a switch, ONBOARDING_API_ENV: "production" uses
// contracts.zekerenmobiel.nl, unset or "test" uses test.zekerenmobiel.nl, and ONBOARDING_API_KEY must hold the key
// for that environment. Sales from the test deployment (test = true, see test-request.ts) have their own switch,
// ONBOARDING_TEST_API_ENV, which defaults to TEST whatever ONBOARDING_API_ENV says.
// The stats endpoint is only on TEST so far, so the dashboard always reads TEST, with STATS_API_KEY as TEST's key.

const ONBOARDING_URL = {
  test: "http://test.zekerenmobiel.nl/Onboarding/2026.1/Appeee/Paper",
  production: "https://contracts.zekerenmobiel.nl/Onboarding/2026.1/Appeee/Paper",
}

const STATS_URL = "http://test.zekerenmobiel.nl/Sales/2026.1/Stats"

function environment(secret: string): "test" | "production" {
  const value = optionalEnv(secret) ?? "test"
  if (value !== "test" && value !== "production") {
    throw new Error(`${secret} must be "production" or "test", got "${value}"`)
  }
  return value
}

/** POST endpoint that queues a sale to be written as a customer in ZMAdmin. */
export function onboardingUrl(test: boolean): string {
  return ONBOARDING_URL[onboardingEnvironment(test)]
}

/** Where a sale is onboarded: test sales follow ONBOARDING_TEST_API_ENV, the others ONBOARDING_API_ENV. */
export function onboardingEnvironment(test: boolean): "test" | "production" {
  return environment(test ? "ONBOARDING_TEST_API_ENV" : "ONBOARDING_API_ENV")
}

/** GET endpoint with sales and cancellations for the dashboard. */
export function statsUrl(): string {
  return STATS_URL
}
