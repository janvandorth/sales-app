import { useCallback, useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  BanIcon,
  MailIcon,
  MoreVerticalIcon,
  PencilIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UserPlusIcon,
} from "lucide-react"
import type { AdminUser } from "@shared/admin-types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { adminApi, ApiError, type AdminProfileInput } from "@/lib/api"

type DialogState = { mode: "invite" } | { mode: "edit"; user: AdminUser } | null

export function AdminPage({ currentUserId, onBack }: { currentUserId: string; onBack: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setUsers(await adminApi.list())
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      toast.success(success)
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="min-h-svh bg-muted">
      <header className="sticky top-0 z-40 border-b bg-header pt-[env(safe-area-inset-top)] text-header-foreground">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Button variant="secondary" size="icon" aria-label="Terug naar formulier" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
          <h1 className="flex-1 text-center text-lg font-semibold">Beheer wervers</h1>
          <Button variant="secondary" size="icon" aria-label="Vernieuwen" onClick={load}>
            <RefreshCwIcon />
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {users ? `${users.length} gebruiker${users.length === 1 ? "" : "s"}` : "Laden…"}
          </p>
          <Button onClick={() => setDialog({ mode: "invite" })}>
            <UserPlusIcon /> Werver uitnodigen
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!users && !error && (
          <div className="flex justify-center p-12">
            <Spinner className="size-6" />
          </div>
        )}

        {users?.map((user) => (
          <Card key={user.id} className="py-4">
            <CardContent className="flex items-start gap-3 px-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{user.wervernaam || "—"}</span>
                  <StatusBadge status={user.status} />
                  {user.isAdmin && (
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheckIcon /> Beheerder
                    </Badge>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Wervernr. {user.wervernr || "—"} · {user.submissions} formulier{user.submissions === 1 ? "" : "en"} ·{" "}
                  {user.status === "invited"
                    ? `uitgenodigd ${formatDate(user.invitedAt)}`
                    : `laatst ingelogd ${formatDate(user.lastSignInAt)}`}
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Acties voor ${user.email}`}>
                    <MoreVerticalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDialog({ mode: "edit", user })}>
                    <PencilIcon /> Bewerken
                  </DropdownMenuItem>
                  {user.status === "invited" && (
                    <DropdownMenuItem
                      onClick={() => run(() => adminApi.resendInvite(user.id), `Uitnodiging opnieuw verstuurd naar ${user.email}`)}
                    >
                      <MailIcon /> Uitnodiging opnieuw sturen
                    </DropdownMenuItem>
                  )}
                  {user.id !== currentUserId && (
                    <DropdownMenuItem
                      variant={user.status === "disabled" ? "default" : "destructive"}
                      onClick={() =>
                        run(
                          () => adminApi.setDisabled(user.id, user.status !== "disabled"),
                          user.status === "disabled" ? "Gebruiker gedeblokkeerd" : "Gebruiker geblokkeerd",
                        )
                      }
                    >
                      <BanIcon /> {user.status === "disabled" ? "Deblokkeren" : "Blokkeren"}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        ))}
      </main>

      <UserDialog
        state={dialog}
        isSelf={dialog?.mode === "edit" && dialog.user.id === currentUserId}
        onClose={() => setDialog(null)}
        onSaved={load}
      />
    </div>
  )
}

function UserDialog({
  state,
  isSelf,
  onClose,
  onSaved,
}: {
  state: DialogState
  isSelf: boolean
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const editing = state?.mode === "edit" ? state.user : null
  const [email, setEmail] = useState("")
  const [profile, setProfile] = useState<AdminProfileInput>({ wervernaam: "", wervernr: "", isAdmin: false })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!state) return
    setError(null)
    setEmail(editing?.email ?? "")
    setProfile({
      wervernaam: editing?.wervernaam ?? "",
      wervernr: editing?.wervernr ?? "",
      isAdmin: editing?.isAdmin ?? false,
    })
  }, [state, editing])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await adminApi.update(editing.id, profile)
        toast.success("Wijzigingen opgeslagen")
      } else {
        await adminApi.invite(email.trim(), profile)
        toast.success(`Uitnodiging verstuurd naar ${email.trim()}`)
      }
      onClose()
      await onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Werver bewerken" : "Werver uitnodigen"}</DialogTitle>
            <DialogDescription>
              {editing
                ? editing.email
                : "De werver ontvangt een e-mail met een link om een wachtwoord in te stellen."}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {!editing && (
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
            <Button type="submit" disabled={saving}>
              {saving && <Spinner />}
              {editing ? "Opslaan" : "Uitnodiging versturen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function StatusBadge({ status }: { status: AdminUser["status"] }) {
  switch (status) {
    case "active":
      return <Badge variant="secondary">Actief</Badge>
    case "invited":
      return <Badge variant="outline">Uitgenodigd</Badge>
    case "disabled":
      return <Badge variant="destructive">Geblokkeerd</Badge>
  }
}

function formatDate(value: string | null): string {
  if (!value) return "nooit"
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : "Er ging iets mis"
}
