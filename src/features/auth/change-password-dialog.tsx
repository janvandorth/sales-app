import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import type { AuthError } from "@supabase/supabase-js"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase"
import { MIN_PASSWORD_LENGTH } from "./set-password-page"

type Props = { email: string; onClose: () => void }

/**
 * Change the signed-in user's password. Asks for the current one first, so whoever picks up an unlocked phone
 * cannot take over the account. Mounted only while open, so its fields start empty every time.
 */
export function ChangePasswordDialog({ email, onClose }: Props) {
  const [current, setCurrent] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Gebruik minimaal ${MIN_PASSWORD_LENGTH} tekens`)
    if (password !== confirm) return setError("De nieuwe wachtwoorden zijn niet gelijk")
    if (password === current) return setError("Kies een ander wachtwoord dan je huidige")

    setSubmitting(true)
    setError(null)
    // Signing in again is how Supabase checks a password; it keeps the same user on this device.
    const verified = await supabase.auth.signInWithPassword({ email, password: current })
    const result = verified.error ?? (await supabase.auth.updateUser({ password })).error
    setSubmitting(false)
    if (result) return setError(describe(result, verified.error !== null))

    toast.success("Wachtwoord gewijzigd")
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Wachtwoord wijzigen</DialogTitle>
            <DialogDescription>{email}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor="current-password">Huidig wachtwoord</FieldLabel>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="change-new-password">Nieuw wachtwoord</FieldLabel>
              <Input
                id="change-new-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <FieldDescription>Minimaal {MIN_PASSWORD_LENGTH} tekens</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="change-confirm-password">Herhaal nieuw wachtwoord</FieldLabel>
              <Input
                id="change-confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuleren
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner />}
              Opslaan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Supabase's messages are in English; the cases a recruiter can run into get a Dutch one. */
function describe(error: AuthError, whileVerifying: boolean): string {
  if (whileVerifying && error.code === "invalid_credentials") return "Je huidige wachtwoord klopt niet"
  if (error.code === "same_password") return "Kies een ander wachtwoord dan je huidige"
  if (error.code === "weak_password") return "Dit wachtwoord is te zwak, kies een sterker wachtwoord"
  if (error.code === "over_request_rate_limit") return "Te veel pogingen, probeer het over een paar minuten opnieuw"
  if (error.name === "AuthRetryableFetchError") return "Geen verbinding, probeer het opnieuw als je online bent"
  return "Wachtwoord wijzigen is mislukt, probeer het opnieuw"
}
