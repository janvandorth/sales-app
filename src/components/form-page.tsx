import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import type { Session } from "@supabase/supabase-js"
import { formSchema, normalizeIban, type ExtractedFields, type FormInput, type FormValues } from "@shared/form-schema"
import { AppHeader } from "@/components/app-header"
import { FIELD_ORDER, SalesForm } from "@/components/sales-form"
import { Spinner } from "@/components/ui/spinner"
import { useOnline } from "@/hooks/use-online"
import { useOutbox } from "@/hooks/use-outbox"
import { useProfile } from "@/hooks/use-profile"
import { ApiError, extractFromPhoto, getAppConfig } from "@/lib/api"
import { createEmptyForm } from "@/lib/form-defaults"
import { prepareScanImage } from "@/lib/image"
import { clearDraft, loadDraft, saveDraft } from "@/lib/offline-store"
import { supabase } from "@/lib/supabase"

const FILL_STEP_MS = 110
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function FormPage({ session }: { session: Session }) {
  const userId = session.user.id
  const online = useOnline()
  const profile = useProfile(userId)
  const outbox = useOutbox(userId)

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: createEmptyForm(),
    mode: "onTouched",
  })
  const [ready, setReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [scanEnabled, setScanEnabled] = useState(false)
  const [busy, setBusy] = useState<"scanning" | "filling" | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Restore an unfinished draft (e.g. after the app was closed), then autosave every change.
  useEffect(() => {
    loadDraft(userId).then((draft) => {
      if (draft) form.reset(draft)
      setReady(true)
    })
  }, [userId, form])

  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setTimeout>
    const subscription = form.watch((values) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveDraft(userId, values as FormInput), 400)
    })
    return () => {
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [ready, userId, form])

  useEffect(() => {
    if (!online) return
    getAppConfig()
      .then((config) => setScanEnabled(config.scanEnabled))
      .catch(() => setScanEnabled(false))
  }, [online])

  async function handleSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      const result = await outbox.submit(values)
      if (result === "sent") toast.success("Formulier verstuurd")
      else toast.info("Offline opgeslagen — wordt automatisch verstuurd zodra je weer online bent")
      await clearDraft(userId)
      form.reset(createEmptyForm())
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Versturen mislukt")
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0]
    event.target.value = ""
    if (!photo) return

    setBusy("scanning")
    try {
      const fields = await extractFromPhoto(userId, await prepareScanImage(photo))
      setBusy("filling")
      await animateFill(fields)
      toast.success("Formulier ingevuld — controleer de gegevens")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Uitlezen van de foto is mislukt")
    } finally {
      setBusy(null)
    }
  }

  /** Fills extracted fields one by one from top to bottom with a short highlight. */
  async function animateFill(fields: ExtractedFields) {
    const values = normalizeExtracted(fields)
    const filled: (keyof FormInput)[] = []
    for (const name of FIELD_ORDER) {
      const value = values[name]
      if (value === undefined) continue
      form.setValue(name, value as never, { shouldDirty: true })
      if (name === "email") form.setValue("perPost", false)
      filled.push(name)

      const element = document.querySelector(`[data-field="${name}"]`)
      element?.scrollIntoView({ block: "center", behavior: "smooth" })
      element?.animate(
        [{ backgroundColor: "color-mix(in oklab, var(--primary) 15%, transparent)" }, { backgroundColor: "transparent" }],
        { duration: 800, easing: "ease-out" },
      )
      await sleep(FILL_STEP_MS)
    }
    await form.trigger(filled)
  }

  const scanDisabledReason = !scanEnabled ? "Scannen is nog niet geconfigureerd" : !online ? "Scannen werkt alleen online" : null

  return (
    <div className="min-h-svh bg-muted">
      <AppHeader
        profile={profile}
        email={session.user.email ?? ""}
        online={online}
        scanEnabled={scanDisabledReason === null && busy === null}
        scanDisabledReason={scanDisabledReason}
        onScan={() => fileInput.current?.click()}
        outbox={outbox.items}
        syncing={outbox.syncing}
        onSync={outbox.flush}
        onSignOut={async () => {
          await clearDraft(userId)
          await supabase.auth.signOut()
        }}
      />
      <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

      {ready ? (
        <SalesForm key={form.getValues("rowId")} form={form} submitting={submitting} onSubmit={handleSubmit} />
      ) : (
        <div className="flex justify-center p-12">
          <Spinner className="size-6" />
        </div>
      )}

      {busy && (
        <div
          className={
            busy === "scanning"
              ? "fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm"
              : "fixed inset-0 z-50"
          }
          aria-busy="true"
          aria-live="polite"
        >
          {busy === "scanning" && (
            <>
              <Spinner className="size-8" />
              <p className="text-sm font-medium">Formulier wordt uitgelezen…</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function normalizeExtracted(fields: ExtractedFields): Partial<FormInput> {
  const values: Partial<FormInput> = { ...fields } as Partial<FormInput>
  if (fields.telefoon) values.telefoon = fields.telefoon.replace(/\D/g, "").replace(/^0+/, "")
  if (fields.landcode && !/^\+\d{1,4}$/.test(fields.landcode)) delete values.landcode
  if (fields.iban) values.iban = normalizeIban(fields.iban)
  if (fields.huisnummer) values.huisnummer = fields.huisnummer.replace(/\D/g, "")
  return values
}
