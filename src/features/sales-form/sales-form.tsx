import { SendIcon } from "lucide-react"
import type { FormValues } from "@shared/form-schema"
import { PAGE_WIDTH } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { Profile } from "@/hooks/use-profile"
import { ConfirmSubmitDialog } from "./confirm-submit-dialog"
import { isOldContractDate } from "./contract-date"
import { DiscardButton } from "./discard-button"
import { WerverField } from "./fields/werver-field"
import type { SalesFormApi } from "./form-types"
import { InvalidIbanDialog } from "./invalid-iban-dialog"
import type { NaamCorrection } from "./naam"
import { AddressSection } from "./sections/address-section"
import { ContactSection } from "./sections/contact-section"
import { ContractSection } from "./sections/contract-section"
import { CustomerSection } from "./sections/customer-section"
import { FormSection } from "./sections/form-section"
import { useAddressLookup } from "./use-address-lookup"
import { useIbanCheck } from "./use-iban-check"
import { useSubmitConfirmation } from "./use-submit-confirmation"
import { shortDate } from "../sales-list/days"

type Props = {
  form: SalesFormApi
  /** An admin may book the sale on another recruiter. */
  profile: Profile | undefined
  submitting: boolean
  /** Capitalization fix made while filling in a scanned form. */
  naamCorrection: NaamCorrection | null
  onSubmit: (values: FormValues) => void
  onDiscard: () => void
}

/** The sales form itself: four sections (plus the werver for admins) and a fixed bottom bar with Wissen / Versturen. */
export function SalesForm({ form, profile, submitting, naamCorrection, onSubmit, onDiscard }: Props) {
  const lookup = useAddressLookup(form)
  // Checked in the order of the form: first the date, then the address, then the IBAN.
  const iban = useIbanCheck(form, onSubmit)
  const address = useSubmitConfirmation(
    () => lookup.check.status === "done" && !lookup.check.data.found,
    iban.guardSubmit,
  )
  const date = useSubmitConfirmation((values) => isOldContractDate(values.datum), address.guardSubmit)
  const busy = submitting || iban.checkingOnSubmit

  return (
    <form
      onSubmit={form.handleSubmit(date.guardSubmit)}
      noValidate
      className={`mx-auto grid gap-4 p-4 pb-24 lg:grid-cols-2 lg:items-start ${PAGE_WIDTH}`}
    >
      {profile?.isAdmin && (
        <div className="lg:col-span-2">
          <FormSection title="Werver">
            <WerverField control={form.control} profile={profile} />
          </FormSection>
        </div>
      )}
      {/* Two columns on a large screen; on a phone the columns stack, so the order stays Klant, Adres, Contact, Contract. */}
      <div className="flex min-w-0 flex-col gap-4">
        <CustomerSection control={form.control} naamCorrection={naamCorrection} />
        <AddressSection control={form.control} lookup={lookup} />
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

      <ConfirmSubmitDialog
        confirmation={date}
        title="Datum ligt meer dan een week terug"
        description={(values) =>
          `De contractdatum is ${shortDate(values.datum)}. Weet je zeker dat je het formulier met deze datum wilt versturen?`
        }
        cancelLabel="Datum aanpassen"
      />
      <ConfirmSubmitDialog
        confirmation={address}
        title="Adres niet gevonden"
        description={(values) =>
          `Bij ${values.postcode.slice(0, 4)} ${values.postcode.slice(4)} ${values.huisnummer} is geen adres gevonden. Weet je zeker dat je het formulier toch wilt versturen?`
        }
        cancelLabel="Adres aanpassen"
      />
      <InvalidIbanDialog iban={iban} />
    </form>
  )
}
