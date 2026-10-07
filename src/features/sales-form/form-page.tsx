import { useRef, useState, type ChangeEvent } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import type { Session } from "@supabase/supabase-js"
import { formSchema, type FormInput, type FormValues } from "@shared/form-schema"
import { Spinner } from "@/components/ui/spinner"
import { useOnline } from "@/hooks/use-online"
import { useProfile } from "@/hooks/use-profile"
import { getErrorMessage } from "@/lib/errors"
import { supabase } from "@/lib/supabase"
import { OutboxDialog } from "../outbox/outbox-dialog"
import type { OutboxItem } from "../outbox/outbox-store"
import { useOutbox } from "../outbox/use-outbox"
import { clearDraft } from "./draft-store"
import { createEmptyForm } from "./form-defaults"
import { FormHeader } from "./form-header"
import { SalesForm } from "./sales-form"
import { ScanOverlay } from "./scan-overlay"
import { useDraft } from "./use-draft"
import { useScanFill } from "./use-scan-fill"

type Props = { session: Session; onOpenDashboard: () => void; onOpenAdmin: () => void }

/** Main page after login: header, the sales form, the outbox dialog and the scan overlay. */
export function FormPage({ session, onOpenDashboard, onOpenAdmin }: Props) {
  const userId = session.user.id
  const online = useOnline()
  const profile = useProfile(userId)
  const outbox = useOutbox(userId)
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: createEmptyForm(),
    mode: "onTouched",
  })
  const { ready } = useDraft(form, userId)
  const scanFill = useScanFill(form, userId)
  const [submitting, setSubmitting] = useState(false)
  const [outboxOpen, setOutboxOpen] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  // A new rowId means a new form; used as key so the form's local state (e.g. manual address) resets too.
  const rowId = useWatch({ control: form.control, name: "rowId" })

  async function startNewForm() {
    await clearDraft(userId)
    form.reset(createEmptyForm())
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function handleSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      const result = await outbox.submit(values)
      if (result === "sent") toast.success("Formulier verstuurd")
      else toast.info("Offline opgeslagen — wordt automatisch verstuurd zodra je weer online bent")
      await startNewForm()
    } catch (error) {
      toast.error(getErrorMessage(error, "Versturen mislukt"))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDiscard() {
    await startNewForm()
    toast("Nieuw formulier gestart")
  }

  /** Moves a queued form back into the editor, e.g. to fix a rejected field. */
  async function handleEditQueued(item: OutboxItem) {
    await outbox.remove(item.values.rowId)
    form.reset(item.values)
    setOutboxOpen(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
    toast("Formulier uit de wachtrij geopend")
  }

  function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0]
    event.target.value = "" // Allow picking the same file again.
    if (photo) void scanFill.scan(photo)
  }

  async function handleSignOut() {
    await clearDraft(userId)
    // Only this device: a global sign-out would also end the recruiter's sessions on other devices.
    await supabase.auth.signOut({ scope: "local" })
  }

  return (
    <div className="min-h-svh bg-muted">
      <FormHeader
        profile={profile}
        email={session.user.email ?? ""}
        online={online}
        scanDisabled={!online || scanFill.phase !== null}
        onScan={() => photoInput.current?.click()}
        outbox={outbox.items}
        syncing={outbox.syncing}
        onOpenOutbox={() => setOutboxOpen(true)}
        onOpenDashboard={onOpenDashboard}
        onOpenAdmin={onOpenAdmin}
        onSignOut={handleSignOut}
      />
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoSelected}
      />

      {ready ? (
        <SalesForm
          key={rowId}
          form={form}
          submitting={submitting}
          naamCorrection={scanFill.naamCorrection}
          onSubmit={handleSubmit}
          onDiscard={handleDiscard}
        />
      ) : (
        <div className="flex justify-center p-12">
          <Spinner className="size-6" />
        </div>
      )}

      <OutboxDialog
        open={outboxOpen}
        onOpenChange={setOutboxOpen}
        items={outbox.items}
        online={online}
        syncing={outbox.syncing}
        onSync={outbox.flush}
        onEdit={handleEditQueued}
        onDelete={outbox.remove}
      />
      <ScanOverlay phase={scanFill.phase} />
    </div>
  )
}
