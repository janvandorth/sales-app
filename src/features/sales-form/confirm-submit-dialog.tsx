import type { ReactNode } from "react"
import type { FormValues } from "@shared/form-schema"
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
import type { useSubmitConfirmation } from "./use-submit-confirmation"

type Props = {
  confirmation: ReturnType<typeof useSubmitConfirmation>
  title: string
  /** The question, about the values waiting to be sent. */
  description: (values: FormValues) => ReactNode
  /** Closes the dialog so the recruiter can fix the field, e.g. "Datum aanpassen". */
  cancelLabel: string
}

/** Asks for confirmation before submitting a form that a check found suspicious. */
export function ConfirmSubmitDialog({ confirmation, title, description, cancelLabel }: Props) {
  const values = confirmation.awaitingConfirmation
  return (
    <AlertDialog open={values !== null} onOpenChange={(open) => !open && confirmation.cancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{values && description(values)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={confirmation.confirm}>Toch versturen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
