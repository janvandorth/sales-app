import { useState } from "react"
import { ChevronsUpDownIcon, CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COUNTRIES } from "@/lib/countries"
import { cn } from "@/lib/utils"

type Props = {
  id?: string
  value: string
  onChange: (dial: string) => void
  invalid?: boolean
}

export function CountryCodePicker({ id, value, onChange, invalid }: Props) {
  const [open, setOpen] = useState(false)
  const selected = COUNTRIES.find((country) => country.dial === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className="w-28 shrink-0 justify-between font-normal"
        >
          <span>
            {selected?.code ?? ""} {value}
          </span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek land of code…" />
          <CommandList>
            <CommandEmpty>Geen land gevonden</CommandEmpty>
            <CommandGroup>
              {COUNTRIES.map((country) => (
                <CommandItem
                  key={country.code}
                  value={`${country.name} ${country.dial} ${country.code}`}
                  onSelect={() => {
                    onChange(country.dial)
                    setOpen(false)
                  }}
                >
                  <span className="flex-1">{country.name}</span>
                  <span className="text-muted-foreground">{country.dial}</span>
                  <CheckIcon className={cn(country.dial === value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
