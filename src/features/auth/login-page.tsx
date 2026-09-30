import { useState, type FormEvent } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase"

export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleForgotPassword() {
    if (!email) return setError("Vul eerst je e-mailadres in")
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    if (error) setError(error.message)
    else setResetSent(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error)
      setError(error.message === "Invalid login credentials" ? "Onjuist e-mailadres of wachtwoord" : error.message)
    setSubmitting(false)
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <img src="/logo.png" alt="Zeker & Mobiel" className="mb-2 h-7 w-auto self-start" />
          <CardTitle className="text-xl">Bellijst</CardTitle>
          <CardDescription>Log in met je wervers-account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {resetSent && (
                <Alert>
                  <AlertDescription>
                    Als dit adres bij ons bekend is, ontvang je een e-mail om je wachtwoord in te stellen.
                  </AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password">Wachtwoord</FieldLabel>
                  <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={handleForgotPassword}>
                    Wachtwoord vergeten?
                  </Button>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <Button type="submit" disabled={submitting}>
                {submitting && <Spinner />}
                Inloggen
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
