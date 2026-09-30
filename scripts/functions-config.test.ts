import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Supabase deploys every edge function with its own deno.json. They must stay identical so all functions
// run the same library versions; edit them together.
describe("edge function deno.json files", () => {
  const root = "supabase/functions"
  const functions = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)

  it.each(functions)("%s has the shared import map", (name) => {
    const reference = readFileSync(join(root, functions[0], "deno.json"), "utf8")
    expect(readFileSync(join(root, name, "deno.json"), "utf8")).toBe(reference)
  })
})
