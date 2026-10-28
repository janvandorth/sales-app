// Shared between the admin-users edge function and the web app.

/** A recruiter an admin adds can sign in at once with this password, and changes it from the account menu. */
export const TEMPORARY_PASSWORD = "tijdelijkwachtwoord"

export type AdminUser = {
  id: string
  email: string
  wervernaam: string
  wervernr: string
  isAdmin: boolean
  /** Whether the photo scan may fill in the customer's name and phone numbers for this recruiter. */
  scanContactFields: boolean
  status: "active" | "invited" | "disabled"
  invitedAt: string | null
  lastSignInAt: string | null
  submissions: number
}
