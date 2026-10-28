import { CameraIcon } from "lucide-react"
import { AppMenu } from "@/components/app-menu"
import { HEADER_BUTTON_CLASS, PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"

type Props = {
  online: boolean
  scanDisabled: boolean
  onScan: () => void
}

/** Header of the form page: camera scan, logo and, as on every page, the menu. */
export function FormHeader({ online, scanDisabled, onScan }: Props) {
  return (
    <PageHeader
      start={
        <Button
          variant="ghost"
          size="icon"
          className={HEADER_BUTTON_CLASS}
          aria-label="Formulier scannen met camera"
          title={online ? "Formulier scannen" : "Scannen werkt alleen online"}
          disabled={scanDisabled}
          onClick={onScan}
        >
          <CameraIcon />
        </Button>
      }
      title={
        // Same treatment as the footer on zekerenmobiel.nl: the color logo rendered white.
        <img src="/logo.png" alt="Zeker & Mobiel — Z&M Sales" className="h-6 w-auto brightness-0 invert" />
      }
      end={<AppMenu />}
    />
  )
}
