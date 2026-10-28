import { ArrowLeftIcon, CameraIcon } from "lucide-react"
import { AppMenu } from "@/components/app-menu"
import { HEADER_BUTTON_CLASS, PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"

type Props = {
  online: boolean
  scanDisabled: boolean
  onScan: () => void
  /** Set when the form was opened from a door marked "Verkocht": back to walking. */
  onBack?: () => void
}

/** Header of the form page: back to walking when it came from there, camera scan, logo and, as on every page, the menu. */
export function FormHeader({ online, scanDisabled, onScan, onBack }: Props) {
  return (
    <PageHeader
      start={
        <>
          {onBack && (
            <Button variant="ghost" size="icon" className={HEADER_BUTTON_CLASS} aria-label="Terug" onClick={onBack}>
              <ArrowLeftIcon />
            </Button>
          )}
          <Button
            variant="ghost"
            className={HEADER_BUTTON_CLASS}
            title={online ? undefined : "Scannen werkt alleen online"}
            disabled={scanDisabled}
            onClick={onScan}
          >
            <CameraIcon /> Scan contract
          </Button>
        </>
      }
      title={
        // Same treatment as the footer on zekerenmobiel.nl: the color logo rendered white. It shrinks before the
        // buttons do when the back button leaves less room.
        <img
          src="/logo.png"
          alt="Zeker & Mobiel — Z&M Sales"
          className="h-6 w-auto max-w-full object-contain brightness-0 invert"
        />
      }
      end={<AppMenu />}
    />
  )
}
