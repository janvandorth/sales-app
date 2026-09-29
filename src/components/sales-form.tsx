import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Controller, useWatch, type Control, type FieldPath, type UseFormReturn } from "react-hook-form"
import { CheckCircle2Icon, PencilIcon, SendIcon, Trash2Icon, XCircleIcon } from "lucide-react"
import {
  BETAALPERIODE_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  GESLACHT_OPTIONS,
  POSTCODE_REGEX,
  normalizeIban,
  normalizePostcode,
  type FormInput,
  type FormValues,
} from "@shared/form-schema"
import { CountryCodePicker } from "@/components/country-code-picker"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDebouncedCheck, type CheckState } from "@/hooks/use-debounced-check"
import { lookupPostcode, validateIban } from "@/lib/api"
import { suggestBanks } from "@/lib/banks"

type Form = UseFormReturn<FormInput, unknown, FormValues>

type Props = {
  form: Form
  submitting: boolean
  onSubmit: (values: FormValues) => void
  onDiscard: () => void
}

export function SalesForm({ form, submitting, onSubmit, onDiscard }: Props) {
  const { control, setValue, handleSubmit } = form
  const [postcode, huisnummer, iban, perPost] = useWatch({
    control,
    name: ["postcode", "huisnummer", "iban", "perPost"],
  })

  // --- Postcode lookup -------------------------------------------------------------------------
  const postcodeKey =
    POSTCODE_REGEX.test(postcode.trim()) && /^\d{1,5}$/.test(huisnummer.trim())
      ? `${normalizePostcode(postcode)}|${huisnummer.trim()}`
      : null
  const postcodeCheck = useDebouncedCheck(postcodeKey, (key, signal) => {
    const [pc, nr] = key.split("|")
    return lookupPostcode(pc, nr, signal)
  })
  const [manualAddress, setManualAddress] = useState(false)
  const lookupFailed =
    postcodeCheck.status === "error" ||
    postcodeCheck.status === "offline" ||
    (postcodeCheck.status === "done" && !postcodeCheck.data.found)
  const addressEditable = manualAddress || lookupFailed

  const previousPostcodeKey = useRef(postcodeKey)
  useEffect(() => {
    if (previousPostcodeKey.current === postcodeKey) return
    previousPostcodeKey.current = postcodeKey
    // The address belongs to the old postcode; clear it until the new lookup answers.
    if (!manualAddress) {
      setValue("straat", "")
      setValue("plaats", "")
    }
  }, [postcodeKey, manualAddress, setValue])

  useEffect(() => {
    if (manualAddress || postcodeCheck.status !== "done" || !postcodeCheck.data.found) return
    setValue("straat", postcodeCheck.data.straat, { shouldValidate: true })
    setValue("plaats", postcodeCheck.data.plaats, { shouldValidate: true })
  }, [postcodeCheck, manualAddress, setValue])

  // --- IBAN validation -------------------------------------------------------------------------
  const normalizedIban = normalizeIban(iban)
  const ibanCheck = useDebouncedCheck(normalizedIban.length >= 15 ? normalizedIban : null, validateIban)

  // An invalid IBAN may be sent, but when online the user has to confirm it first.
  const [checkingIban, setCheckingIban] = useState(false)
  const [pendingInvalidIban, setPendingInvalidIban] = useState<FormValues | null>(null)

  const submit = handleSubmit(async (values) => {
    if (!navigator.onLine) return onSubmit(values)

    let valid: boolean | null = null
    if (ibanCheck.status === "done" && ibanCheck.data.iban === values.iban) {
      valid = ibanCheck.data.valid
    } else {
      setCheckingIban(true)
      try {
        valid = (await validateIban(values.iban, AbortSignal.timeout(8000))).valid
      } catch {
        valid = null // Check unavailable; don't block the recruiter.
      } finally {
        setCheckingIban(false)
      }
    }

    if (valid === false) setPendingInvalidIban(values)
    else onSubmit(values)
  })

  return (
    <form onSubmit={submit} noValidate className="mx-auto flex max-w-xl flex-col gap-4 p-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>Klant</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <TextField control={control} name="datum" label="Datum" type="date" />
            <TextField control={control} name="klantnummer" label="Klantnummer" inputMode="numeric" />
            <ChoiceField control={control} name="geslacht" label="Geslacht" options={GESLACHT_OPTIONS} columns={2} />
            <TextField
              control={control}
              name="naam"
              label="Voorletter(s) + naam"
              placeholder="P.J. Jansen"
              description="Voorletters met punten, gevolgd door de achternaam"
              autoCapitalize="words"
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adres</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <TextField
              control={control}
              name="postcode"
              label="Postcode"
              placeholder="1234 AB"
              autoCapitalize="characters"
              addon={<CheckIndicator state={postcodeCheck} isValid={(data) => data.found} />}
            />
            <div className="grid grid-cols-2 gap-4">
              <TextField control={control} name="huisnummer" label="Huisnummer" inputMode="numeric" />
              <TextField control={control} name="toevoeging" label="Toevoeging" optional />
            </div>
            <TextField control={control} name="straat" label="Straat" readOnly={!addressEditable} />
            <TextField control={control} name="plaats" label="Plaats" readOnly={!addressEditable} />
            <AddressHint
              state={postcodeCheck}
              editable={addressEditable}
              manual={manualAddress}
              onManual={() => setManualAddress(true)}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <PhoneField control={control} />
            <Controller
              control={control}
              name="perPost"
              render={({ field }) => (
                <Field orientation="horizontal" data-field="perPost">
                  <FieldContent>
                    <FieldLabel htmlFor="perPost">Geen e-mail, klant wil per post</FieldLabel>
                  </FieldContent>
                  <Switch
                    id="perPost"
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked)
                      if (checked) setValue("email", "", { shouldValidate: true })
                    }}
                  />
                </Field>
              )}
            />
            <TextField
              control={control}
              name="email"
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder={perPost ? "Klant ontvangt post" : "naam@voorbeeld.nl"}
              disabled={perPost}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contract</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <TextField
              control={control}
              name="iban"
              label="IBAN"
              placeholder="NL00 BANK 0123 4567 89"
              autoCapitalize="characters"
              autoComplete="off"
              addon={<CheckIndicator state={ibanCheck} isValid={(data) => data.valid} />}
              description={ibanDescription(ibanCheck)}
            />
            <BankSuggestions
              iban={normalizedIban}
              onPick={(code) => setValue("iban", `${normalizedIban.slice(0, 4)} ${code} `, { shouldDirty: true })}
            />
            <ChoiceField control={control} name="contractType" label="Contracttype" options={CONTRACT_TYPE_OPTIONS} columns={2} />
            <ChoiceField control={control} name="betaalperiode" label="Betaaltermijn" options={BETAALPERIODE_OPTIONS} />
            <Controller
              control={control}
              name="opmerkingen"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} data-field="opmerkingen">
                  <FieldLabel htmlFor="opmerkingen">
                    Opmerkingen <span className="font-normal text-muted-foreground">(optioneel)</span>
                  </FieldLabel>
                  <Textarea id="opmerkingen" rows={3} {...field} aria-invalid={fieldState.invalid} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-xl">
          <div className="flex gap-2">
            <DiscardButton onDiscard={onDiscard} disabled={submitting} />
            <Button type="submit" size="lg" className="flex-1" disabled={submitting || checkingIban}>
              {submitting || checkingIban ? <Spinner /> : <SendIcon />}
              Versturen
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={pendingInvalidIban !== null} onOpenChange={(open) => !open && setPendingInvalidIban(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>IBAN is ongeldig</AlertDialogTitle>
            <AlertDialogDescription>
              De IBAN-controle heeft {pendingInvalidIban?.iban} afgekeurd. Weet je zeker dat je het formulier toch wilt
              versturen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>IBAN aanpassen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingInvalidIban) onSubmit(pendingInvalidIban)
                setPendingInvalidIban(null)
              }}
            >
              Toch versturen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

/** Form fields in top-to-bottom order; used for the scan fill animation. */
export const FIELD_ORDER = [
  "klantnummer",
  "geslacht",
  "naam",
  "postcode",
  "huisnummer",
  "toevoeging",
  "straat",
  "plaats",
  "landcode",
  "telefoon",
  "email",
  "iban",
  "contractType",
  "betaalperiode",
] as const satisfies readonly FieldPath<FormInput>[]

type StringField = {
  [K in FieldPath<FormInput>]: FormInput[K] extends string ? K : never
}[FieldPath<FormInput>]

type TextFieldProps = {
  control: Control<FormInput, unknown, FormValues>
  name: StringField
  label: string
  description?: ReactNode
  optional?: boolean
  addon?: ReactNode
} & Omit<ComponentProps<"input">, "name">

function TextField({ control, name, label, description, optional, addon, readOnly, ...inputProps }: TextFieldProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const shared = {
          ...inputProps,
          ...field,
          id: name,
          readOnly,
          tabIndex: readOnly ? -1 : undefined,
          "aria-invalid": fieldState.invalid,
        }
        return (
          <Field data-invalid={fieldState.invalid} data-field={name}>
            <FieldLabel htmlFor={name}>
              {label}
              {optional && <span className="font-normal text-muted-foreground">(optioneel)</span>}
            </FieldLabel>
            {addon ? (
              <InputGroup className={readOnly ? "bg-muted" : undefined}>
                <InputGroupInput {...shared} />
                <InputGroupAddon align="inline-end">{addon}</InputGroupAddon>
              </InputGroup>
            ) : (
              <Input {...shared} className={readOnly ? "bg-muted text-muted-foreground" : undefined} />
            )}
            {description && !fieldState.error && <FieldDescription>{description}</FieldDescription>}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )
      }}
    />
  )
}

type ChoiceFieldProps = {
  control: Control<FormInput, unknown, FormValues>
  name: "geslacht" | "contractType" | "betaalperiode"
  label: string
  options: readonly string[]
  columns?: 1 | 2
}

function ChoiceField({ control, name, label, options, columns = 1 }: ChoiceFieldProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid} data-field={name}>
          <FieldLegend variant="label">{label}</FieldLegend>
          <RadioGroup
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
            aria-invalid={fieldState.invalid}
            className={columns === 2 ? "grid-cols-2" : undefined}
          >
            {options.map((option) => {
              const id = `${name}-${option}`
              return (
                <FieldLabel key={option} htmlFor={id}>
                  <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                    <RadioGroupItem value={option} id={id} aria-invalid={fieldState.invalid} />
                    <FieldContent>
                      <FieldTitle>{option}</FieldTitle>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              )
            })}
          </RadioGroup>
          <FieldError errors={[fieldState.error]} />
        </FieldSet>
      )}
    />
  )
}

function PhoneField({ control }: { control: Control<FormInput, unknown, FormValues> }) {
  return (
    <Field data-field="telefoon">
      <FieldLabel htmlFor="telefoon">Telefoonnummer</FieldLabel>
      <div className="flex gap-2">
        <Controller
          control={control}
          name="landcode"
          render={({ field, fieldState }) => (
            <div data-field="landcode" className="rounded-md">
              <CountryCodePicker id="landcode" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
            </div>
          )}
        />
        <Controller
          control={control}
          name="telefoon"
          render={({ field, fieldState }) => (
            <Input
              id="telefoon"
              type="tel"
              inputMode="numeric"
              placeholder="612345678"
              {...field}
              onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ""))}
              aria-invalid={fieldState.invalid}
            />
          )}
        />
      </div>
      <Controller
        control={control}
        name="telefoon"
        render={({ fieldState }) =>
          fieldState.error ? (
            <FieldError errors={[fieldState.error]} />
          ) : (
            <FieldDescription>Zonder 0 of landcode, alleen cijfers</FieldDescription>
          )
        }
      />
    </Field>
  )
}

/** While a Dutch IBAN is being typed, offers the bank codes that match what was typed so far. */
function BankSuggestions({ iban, onPick }: { iban: string; onPick: (code: string) => void }) {
  const banks = suggestBanks(iban)
  if (banks.length === 0) return null
  return (
    <div className="-mt-3 flex flex-wrap gap-1.5" aria-label="Bankcode suggesties">
      {banks.map((bank) => (
        <Button
          key={bank.code}
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            onPick(bank.code)
            document.getElementById("iban")?.focus()
          }}
        >
          <span className="font-mono font-semibold">{bank.code}</span>
          <span className="text-muted-foreground">{bank.name}</span>
        </Button>
      ))}
    </div>
  )
}

function DiscardButton({ onDiscard, disabled }: { onDiscard: () => void; disabled: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="lg" disabled={disabled}>
          <Trash2Icon />
          Wissen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Formulier wissen?</AlertDialogTitle>
          <AlertDialogDescription>
            Alle ingevulde gegevens worden verwijderd en je begint met een nieuw, leeg formulier.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuleren</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            Wissen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function CheckIndicator<T>({ state, isValid }: { state: CheckState<T>; isValid: (data: T) => boolean }) {
  switch (state.status) {
    case "pending":
      return <Spinner aria-label="Bezig met controleren" />
    case "done":
      return isValid(state.data) ? (
        <CheckCircle2Icon className="text-green-600" aria-label="Gecontroleerd" />
      ) : (
        <XCircleIcon className="text-destructive" aria-label="Niet gevonden" />
      )
    case "error":
      return <XCircleIcon className="text-muted-foreground" aria-label="Controle mislukt" />
    default:
      return null
  }
}

function AddressHint({
  state,
  editable,
  manual,
  onManual,
}: {
  state: CheckState<{ found: boolean }>
  editable: boolean
  manual: boolean
  onManual: () => void
}) {
  if (manual) return <FieldDescription>Adres wordt handmatig ingevuld.</FieldDescription>
  if (state.status === "done" && !state.data.found) {
    return <FieldDescription className="text-destructive">Adres niet gevonden — vul straat en plaats handmatig in.</FieldDescription>
  }
  if (state.status === "error") {
    return <FieldDescription>Adrescontrole mislukt — vul straat en plaats handmatig in.</FieldDescription>
  }
  if (state.status === "offline") {
    return <FieldDescription>Offline — vul straat en plaats handmatig in.</FieldDescription>
  }
  if (editable) return null
  return (
    <div className="flex items-center justify-between gap-2">
      <FieldDescription>Straat en plaats worden automatisch ingevuld gebaseerd op postcode en huisnummer.</FieldDescription>
      <Button type="button" variant="ghost" size="sm" onClick={onManual}>
        <PencilIcon /> Aanpassen
      </Button>
    </div>
  )
}

function ibanDescription(state: CheckState<{ valid: boolean; bank?: string | null }>): ReactNode {
  if (state.status === "done") {
    if (!state.data.valid) return <span className="text-amber-600">IBAN ongeldig — je kunt het formulier wel versturen</span>
    return state.data.bank ? `IBAN geldig · ${state.data.bank}` : "IBAN geldig"
  }
  if (state.status === "offline") return "Offline — IBAN wordt gecontroleerd bij versturen"
  if (state.status === "error") return "IBAN-controle mislukt, probeer later opnieuw"
  return undefined
}
