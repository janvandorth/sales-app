import { useState } from "react"
import { PencilIcon, SendIcon, Trash2Icon } from "lucide-react"
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
import { Spinner } from "@/components/ui/spinner"
import type { OutboxItem } from "./outbox-store"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: OutboxItem[]
  online: boolean
  syncing: boolean
  onSync: () => void
  onEdit: (item: OutboxItem) => void
  onDelete: (rowId: string) => void
}

export function OutboxDialog({ open, onOpenChange, items, online, syncing, onSync, onEdit, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Wachtrij</DialogTitle>
          <DialogDescription>
            Formulieren die nog niet verstuurd zijn. Ze worden automatisch verstuurd zodra je online bent.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[50svh] flex-col gap-2 overflow-y-auto">
          {items.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">De wachtrij is leeg.</p>}
          {items.map((item) => (
            <div key={item.values.rowId} className="flex flex-col gap-2 rounded-lg border p-3">
              <div>
                <p className="font-medium">{item.values.naam || "Naamloos"}</p>
                <p className="text-xs text-muted-foreground">
                  Klantnr. {item.values.klantnummer || "—"} · opgeslagen {formatTime(item.queuedAt)}
                </p>
              </div>
              {item.rejectedReason && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription>
                    Geweigerd: {item.rejectedReason}. Pas het formulier aan en verstuur opnieuw.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(item)}>
                  <PencilIcon /> Bewerken
                </Button>
                {confirmDelete === item.values.rowId ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      onDelete(item.values.rowId)
                      setConfirmDelete(null)
                    }}
                  >
                    <Trash2Icon /> Zeker weten?
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(item.values.rowId)}>
                    <Trash2Icon /> Verwijderen
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <p className="text-xs text-muted-foreground">Bewerken vervangt het formulier dat je nu open hebt.</p>
        )}

        <DialogFooter>
          <Button onClick={onSync} disabled={!online || syncing || items.length === 0}>
            {syncing ? <Spinner /> : <SendIcon />}
            {online ? "Nu versturen" : "Offline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}
