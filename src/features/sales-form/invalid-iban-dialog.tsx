import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { useIbanCheck } from "./use-iban-check"

/** Asks for confirmation before submitting a form whose IBAN was rejected by the check. */
export function InvalidIbanDialog({ iban }: { iban: ReturnType<typeof useIbanCheck> }) {
  return (
    <AlertDialog open={iban.awaitingConfirmation !== null} onOpenChange={(open) => !open && iban.cancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>IBAN is ongeldig</AlertDialogTitle>
          <AlertDialogDescription>
            De IBAN-controle heeft {iban.awaitingConfirmation?.iban} afgekeurd. Weet je zeker dat je het formulier
            toch wilt versturen?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>IBAN aanpassen</AlertDialogCancel>
          <AlertDialogAction onClick={iban.confirm}>Toch versturen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
