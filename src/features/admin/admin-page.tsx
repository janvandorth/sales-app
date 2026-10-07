import { useState } from "react"
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
import { HEADER_BUTTON_CLASS, PAGE_WIDTH, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { adminApi } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { StatusBadge } from "./status-badge"
import { useAdminAction, useAdminUsers } from "./use-admin-users"
import { UserDialog } from "./user-dialog"

type Props = { currentUserId: string; onBack: () => void }

/** Admin-only overview of all recruiters, with invite, edit, resend invite and block/unblock. */
export function AdminPage({ currentUserId, onBack }: Props) {
  const users = useAdminUsers()
  // undefined = closed, null = inviting a new recruiter, AdminUser = editing that recruiter.
  const [dialogUser, setDialogUser] = useState<AdminUser | null | undefined>(undefined)

  return (
    <div className="min-h-svh bg-muted">
      <PageHeader
        start={
          <Button
            variant="ghost"
            size="icon"
            className={HEADER_BUTTON_CLASS}
            aria-label="Terug naar formulier"
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </Button>
        }
        title="Beheer wervers"
        end={
          <Button
            variant="ghost"
            size="icon"
            className={HEADER_BUTTON_CLASS}
            aria-label="Vernieuwen"
            onClick={() => void users.refetch()}
          >
            <RefreshCwIcon className={users.isFetching ? "animate-spin" : undefined} />
          </Button>
        }
      />

      <main className={`mx-auto flex flex-col gap-4 p-4 ${PAGE_WIDTH}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {users.data ? `${users.data.length} gebruiker${users.data.length === 1 ? "" : "s"}` : "Laden…"}
          </p>
          <Button onClick={() => setDialogUser(null)}>
            <UserPlusIcon /> Werver uitnodigen
          </Button>
        </div>

        {users.error && (
          <Alert variant="destructive">
            <AlertDescription>{getErrorMessage(users.error)}</AlertDescription>
          </Alert>
        )}
        {users.isPending && (
          <div className="flex justify-center p-12">
            <Spinner className="size-6" />
          </div>
        )}
        {users.data?.map((user) => (
          <UserCard key={user.id} user={user} isSelf={user.id === currentUserId} onEdit={() => setDialogUser(user)} />
        ))}
      </main>

      {dialogUser !== undefined && (
        <UserDialog
          key={dialogUser?.id ?? "new"}
          user={dialogUser}
          isSelf={dialogUser?.id === currentUserId}
          onClose={() => setDialogUser(undefined)}
        />
      )}
    </div>
  )
}

function UserCard({ user, isSelf, onEdit }: { user: AdminUser; isSelf: boolean; onEdit: () => void }) {
  const resendInvite = useAdminAction(() => adminApi.resendInvite(user.id))
  const toggleBlocked = useAdminAction(() => adminApi.setDisabled(user.id, user.status !== "disabled"))

  return (
    <Card className="py-4">
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
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon /> Bewerken
            </DropdownMenuItem>
            {user.status === "invited" && (
              <DropdownMenuItem
                onClick={() =>
                  resendInvite.mutate(undefined, {
                    onSuccess: () => toast.success(`Uitnodiging opnieuw verstuurd naar ${user.email}`),
                  })
                }
              >
                <MailIcon /> Uitnodiging opnieuw sturen
              </DropdownMenuItem>
            )}
            {!isSelf && (
              <DropdownMenuItem
                variant={user.status === "disabled" ? "default" : "destructive"}
                onClick={() =>
                  toggleBlocked.mutate(undefined, {
                    onSuccess: () =>
                      toast.success(user.status === "disabled" ? "Gebruiker gedeblokkeerd" : "Gebruiker geblokkeerd"),
                  })
                }
              >
                <BanIcon /> {user.status === "disabled" ? "Deblokkeren" : "Blokkeren"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  )
}

function formatDate(value: string | null): string {
  if (!value) return "nooit"
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
}
