import { SendIcon } from "lucide-react"
import type { FormValues } from "@shared/form-schema"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { DiscardButton } from "./discard-button"
import type { SalesFormApi } from "./form-types"
import { InvalidIbanDialog } from "./invalid-iban-dialog"
import { AddressSection } from "./sections/address-section"
import { ContactSection } from "./sections/contact-section"
import { ContractSection } from "./sections/contract-section"
import { CustomerSection } from "./sections/customer-section"
import { useIbanCheck } from "./use-iban-check"

type Props = {
  form: SalesFormApi
  submitting: boolean
  onSubmit: (values: FormValues) => void
  onDiscard: () => void
}

/** The sales form itself: four sections plus a fixed bottom bar with Wissen / Versturen. */
export function SalesForm({ form, submitting, onSubmit, onDiscard }: Props) {
  const iban = useIbanCheck(form, onSubmit)
  const busy = submitting || iban.checkingOnSubmit

  return (
    <form
      onSubmit={form.handleSubmit(iban.guardSubmit)}
      noValidate
      className="mx-auto flex max-w-xl flex-col gap-4 p-4 pb-24"
    >
      <CustomerSection control={form.control} />
      <AddressSection form={form} />
      <ContactSection form={form} />
      <ContractSection form={form} iban={iban} />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2">
          <DiscardButton onDiscard={onDiscard} disabled={submitting} />
          <Button type="submit" size="lg" className="flex-1" disabled={busy}>
            {busy ? <Spinner /> : <SendIcon />}
            Versturen
          </Button>
        </div>
      </div>

      <InvalidIbanDialog iban={iban} />
    </form>
  )
}
