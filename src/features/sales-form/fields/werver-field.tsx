import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { Controller } from "react-hook-form"
import type { Recruiter } from "@shared/submission-record"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Profile } from "@/hooks/use-profile"
import { listRecruiters } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import type { SalesFormControl } from "../form-types"

type Props = { control: SalesFormControl; profile: Profile }

/** Admins only: the recruiter the sale is booked on, from the app's non-admin recruiters. Empty means the admin themself. */
export function WerverField({ control, profile }: Props) {
  const [open, setOpen] = useState(false)
  const recruiters = useQuery({ queryKey: ["recruiters"], queryFn: listRecruiters, staleTime: 60 * 60_000 })
  const label = (werver: Recruiter) => `${werver.wervernaam} (${werver.wervernr})`

  return (
    <Controller
      control={control}
      name="werver"
      render={({ field }) => (
        <Field data-field="werver">
          <FieldLabel htmlFor="werver">Werver</FieldLabel>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                id="werver"
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between font-normal"
              >
                <span className="truncate">{field.value ? label(field.value) : `Jijzelf: ${label(profile)}`}</span>
                <ChevronsUpDownIcon className="opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
              <Command>
                <CommandInput placeholder="Zoek naam of wervernummer…" />
                <CommandList>
                  <CommandEmpty>
                    {recruiters.isPending
                      ? "Wervers laden…"
                      : recruiters.isError
                        ? getErrorMessage(recruiters.error, "Wervers niet geladen")
                        : "Geen werver gevonden"}
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value={`Jijzelf ${profile.wervernaam} ${profile.wervernr}`}
                      onSelect={() => {
                        field.onChange(null)
                        setOpen(false)
                      }}
                    >
                      <span className="flex-1">Jijzelf</span>
                      <span className="text-muted-foreground">{profile.wervernr}</span>
                      <CheckIcon className={cn(field.value ? "opacity-0" : "opacity-100")} />
                    </CommandItem>
                    {recruiters.data?.map((werver) => (
                      <CommandItem
                        key={werver.wervernr}
                        value={`${werver.wervernaam} ${werver.wervernr}`}
                        onSelect={() => {
                          field.onChange(werver)
                          setOpen(false)
                        }}
                      >
                        <span className="flex-1">{werver.wervernaam}</span>
                        <span className="text-muted-foreground">{werver.wervernr}</span>
                        <CheckIcon
                          className={cn(field.value?.wervernr === werver.wervernr ? "opacity-100" : "opacity-0")}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <FieldDescription>
            {recruiters.isError
              ? getErrorMessage(recruiters.error, "Wervers niet geladen")
              : "Op wie de verkoop wordt geboekt in ZMAdmin"}
          </FieldDescription>
        </Field>
      )}
    />
  )
}
