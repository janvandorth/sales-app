import type { Control, UseFormReturn } from "react-hook-form"
import type { FormInput, FormValues } from "@shared/form-schema"

/** react-hook-form instance for the sales form: raw input in, validated FormValues out. */
export type SalesFormApi = UseFormReturn<FormInput, unknown, FormValues>
export type SalesFormControl = Control<FormInput, unknown, FormValues>
