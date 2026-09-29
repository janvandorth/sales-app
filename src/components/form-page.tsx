import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { useForm, useWatch } from "react-hook-form"
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

// Scan fill animation: text fields are "typed", choices are set at once.
const TYPE_CHAR_MS = 22
const MAX_TYPE_FIELD_MS = 450
const CHOICE_STEP_MS = 120
const TYPED_FIELDS = new Set<keyof FormInput>([
  "klantnummer",
  "naam",
  "postcode",
  "huisnummer",
  "toevoeging",
  "straat",
  "plaats",
  "telefoon",
  "email",
  "iban",
])
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function FormPage({ session, onOpenAdmin }: { session: Session; onOpenAdmin: () => void }) {
  const userId = session.user.id
  const online = useOnline()
  const profile = useProfile(userId)
  const outbox = useOutbox(userId)

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: createEmptyForm(),
    mode: "onTouched",
  })
  // A new rowId means a new form; it is used as the SalesForm key so its local state resets too.
  const rowId = useWatch({ control: form.control, name: "rowId" })
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
      void saveDraft(userId, form.getValues())
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

  async function handleDiscard() {
    await clearDraft(userId)
    form.reset(createEmptyForm())
    window.scrollTo({ top: 0, behavior: "smooth" })
    toast("Nieuw formulier gestart")
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0]
    event.target.value = ""
    if (!photo) return

    setBusy("scanning")
    try {
      const { fields, mock } = await extractFromPhoto(userId, await prepareScanImage(photo))
      setBusy("filling")
      await animateFill(fields)
      if (mock) toast.info("Demo: voorbeeldgegevens ingevuld (Claude is nog niet gekoppeld)")
      else toast.success("Formulier ingevuld — controleer de gegevens")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Uitlezen van de foto is mislukt")
    } finally {
      setBusy(null)
    }
  }

  /** Types extracted values into the fields one by one, top to bottom, without scrolling. */
  async function animateFill(fields: ExtractedFields) {
    const values = normalizeExtracted(fields)
    const filled: (keyof FormInput)[] = []
    for (const name of FIELD_ORDER) {
      const value = values[name]
      if (value === undefined) continue
      if (name === "email") form.setValue("perPost", false)
      filled.push(name)

      document
        .querySelector(`[data-field="${name}"]`)
        ?.animate(
          [{ backgroundColor: "color-mix(in oklab, var(--primary) 15%, transparent)" }, { backgroundColor: "transparent" }],
          { duration: 900, easing: "ease-out" },
        )

      if (TYPED_FIELDS.has(name)) {
        const text = String(value)
        const perChar = Math.min(TYPE_CHAR_MS, MAX_TYPE_FIELD_MS / text.length)
        for (let i = 1; i <= text.length; i++) {
          form.setValue(name, text.slice(0, i) as never)
          await sleep(perChar)
        }
      } else {
        form.setValue(name, value as never)
        await sleep(CHOICE_STEP_MS)
      }
      form.setValue(name, value as never, { shouldDirty: true })
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
        onOpenAdmin={onOpenAdmin}
        onSignOut={async () => {
          await clearDraft(userId)
          await supabase.auth.signOut()
        }}
      />
      <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

      {ready ? (
        <SalesForm
          key={rowId}
          form={form}
          submitting={submitting}
          onSubmit={handleSubmit}
          onDiscard={handleDiscard}
        />
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
