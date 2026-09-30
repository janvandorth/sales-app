import { useState } from "react"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { AdminPage } from "@/features/admin/admin-page"
import { LoginPage } from "@/features/auth/login-page"
import { SetPasswordPage } from "@/features/auth/set-password-page"
import { useSession } from "@/features/auth/use-session"
import { FormPage } from "@/features/sales-form/form-page"

export default function App() {
  const { session, loading, needsPassword, isInvite, passwordSet } = useSession()
  const [view, setView] = useState<"form" | "admin">("form")

  function content() {
    if (loading) {
      return (
        <div className="flex min-h-svh items-center justify-center">
          <Spinner className="size-6" />
        </div>
      )
    }
    if (!session) return <LoginPage />
    if (needsPassword) {
      return <SetPasswordPage email={session.user.email ?? ""} isInvite={isInvite} onDone={passwordSet} />
    }
    if (view === "admin") return <AdminPage currentUserId={session.user.id} onBack={() => setView("form")} />
    return <FormPage key={session.user.id} session={session} onOpenAdmin={() => setView("admin")} />
  }

  return (
    <>
      {content()}
      <Toaster position="top-center" richColors />
    </>
  )
}
