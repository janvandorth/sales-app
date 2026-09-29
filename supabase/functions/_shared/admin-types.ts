// Shared between the admin-users edge function and the web app.
export type AdminUser = {
  id: string
  email: string
  wervernaam: string
  wervernr: string
  isAdmin: boolean
  status: "active" | "invited" | "disabled"
  invitedAt: string | null
  lastSignInAt: string | null
  submissions: number
}
