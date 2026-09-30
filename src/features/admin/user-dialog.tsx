import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import type { AdminUser } from "@shared/admin-types"
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
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { adminApi, type AdminProfileInput } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAdminAction } from "./use-admin-users"

type Props = {
  /** The recruiter to edit, or null to invite a new one. */
  user: AdminUser | null
  isSelf: boolean
  onClose: () => void
}

/**
 * Invite or edit a recruiter. Mounted only while open (and keyed by user), so its state starts fresh
 * every time it opens.
 */
export function UserDialog({ user, isSelf, onClose }: Props) {
  const [email, setEmail] = useState("")
  const [profile, setProfile] = useState<AdminProfileInput>({
    wervernaam: user?.wervernaam ?? "",
    wervernr: user?.wervernr ?? "",
    isAdmin: user?.isAdmin ?? false,
  })
  const save = useAdminAction(
    () => (user ? adminApi.update(user.id, profile) : adminApi.invite(email.trim(), profile)),
    { toastErrors: false },
  )

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    save.mutate(undefined, {
      onSuccess: () => {
        toast.success(user ? "Wijzigingen opgeslagen" : `Uitnodiging verstuurd naar ${email.trim()}`)
        onClose()
      },
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{user ? "Werver bewerken" : "Werver uitnodigen"}</DialogTitle>
            <DialogDescription>
              {user ? user.email : "De werver ontvangt een e-mail met een link om een wachtwoord in te stellen."}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            {save.error && (
              <Alert variant="destructive">
                <AlertDescription>{getErrorMessage(save.error)}</AlertDescription>
              </Alert>
            )}
            {!user && (
              <Field>
                <FieldLabel htmlFor="invite-email">E-mail</FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="wervernaam">Wervernaam</FieldLabel>
              <Input
                id="wervernaam"
                required
                value={profile.wervernaam}
                onChange={(event) => setProfile({ ...profile, wervernaam: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="wervernr">Wervernummer</FieldLabel>
              <Input
                id="wervernr"
                required
                value={profile.wervernr}
                onChange={(event) => setProfile({ ...profile, wervernr: event.target.value })}
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="is-admin">Beheerder</FieldLabel>
                <FieldDescription>Mag wervers bekijken en uitnodigen</FieldDescription>
              </FieldContent>
              <Switch
                id="is-admin"
                checked={profile.isAdmin}
                disabled={isSelf}
                onCheckedChange={(checked) => setProfile({ ...profile, isAdmin: checked })}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuleren
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner />}
              {user ? "Opslaan" : "Uitnodiging versturen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
