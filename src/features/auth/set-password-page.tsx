import { useState, type FormEvent } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase"

const MIN_LENGTH = 8

export function SetPasswordPage({ email, isInvite, onDone }: { email: string; isInvite: boolean; onDone: () => void }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (password.length < MIN_LENGTH) return setError(`Gebruik minimaal ${MIN_LENGTH} tekens`)
    if (password !== confirm) return setError("De wachtwoorden zijn niet gelijk")

    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{isInvite ? "Welkom bij Z&M Sales" : "Nieuw wachtwoord"}</CardTitle>
          <CardDescription>Stel een wachtwoord in voor {email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="new-password">Wachtwoord</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <FieldDescription>Minimaal {MIN_LENGTH} tekens</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password">Herhaal wachtwoord</FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </Field>
              <Button type="submit" disabled={submitting}>
                {submitting && <Spinner />}
                Wachtwoord opslaan
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
