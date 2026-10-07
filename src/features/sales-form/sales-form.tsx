import { SendIcon } from "lucide-react"
import type { FormValues } from "@shared/form-schema"
import { PAGE_WIDTH } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { DiscardButton } from "./discard-button"
import type { SalesFormApi } from "./form-types"
import { InvalidIbanDialog } from "./invalid-iban-dialog"
import type { NaamCorrection } from "./naam"
import { AddressSection } from "./sections/address-section"
import { ContactSection } from "./sections/contact-section"
import { ContractSection } from "./sections/contract-section"
import { CustomerSection } from "./sections/customer-section"
import { useIbanCheck } from "./use-iban-check"

type Props = {
  form: SalesFormApi
  submitting: boolean
  /** Capitalization fix made while filling in a scanned form. */
  naamCorrection: NaamCorrection | null
  onSubmit: (values: FormValues) => void
  onDiscard: () => void
}

/** The sales form itself: four sections plus a fixed bottom bar with Wissen / Versturen. */
export function SalesForm({ form, submitting, naamCorrection, onSubmit, onDiscard }: Props) {
  const iban = useIbanCheck(form, onSubmit)
  const busy = submitting || iban.checkingOnSubmit

  return (
    <form
      onSubmit={form.handleSubmit(iban.guardSubmit)}
      noValidate
      className={`mx-auto grid gap-4 p-4 pb-24 lg:grid-cols-2 lg:items-start ${PAGE_WIDTH}`}
    >
      {/* Two columns on a large screen; on a phone the columns stack, so the order stays Klant, Adres, Contact, Contract. */}
      <div className="flex min-w-0 flex-col gap-4">
        <CustomerSection control={form.control} naamCorrection={naamCorrection} />
        <AddressSection form={form} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <ContactSection form={form} />
        <ContractSection form={form} iban={iban} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className={`mx-auto flex gap-2 lg:justify-end ${PAGE_WIDTH}`}>
          <DiscardButton onDiscard={onDiscard} disabled={submitting} />
          <Button type="submit" size="lg" className="flex-1 lg:w-64 lg:flex-none" disabled={busy}>
            {busy ? <Spinner /> : <SendIcon />}
            Versturen
          </Button>
        </div>
      </div>

      <InvalidIbanDialog iban={iban} />
    </form>
  )
}
