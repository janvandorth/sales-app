import { useState } from "react"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { AdminPage } from "@/features/admin/admin-page"
import { LoginPage } from "@/features/auth/login-page"
import { SetPasswordPage } from "@/features/auth/set-password-page"
import { useSession } from "@/features/auth/use-session"
import { DashboardPage } from "@/features/dashboard/dashboard-page"
import { FormPage } from "@/features/sales-form/form-page"
import { useProfile } from "@/hooks/use-profile"
import { DEMO_MODE } from "@/lib/api"

export default function App() {
  const { session, loading, needsPassword, isInvite, passwordSet } = useSession()
  const [view, setView] = useState<"form" | "dashboard" | "admin">("form")
  const profile = useProfile(session?.user.id)

  function content() {
    if (import.meta.env.DEV && DEMO_MODE) {
      const demoProfile = { wervernaam: "Jan van Dorth", wervernr: "0212BB", isAdmin: DEMO_MODE === "admin" }
      return <DashboardPage profile={demoProfile} onBack={() => {}} />
    }
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
    if (view === "dashboard") return <DashboardPage profile={profile} onBack={() => setView("form")} />
    if (view === "admin") return <AdminPage currentUserId={session.user.id} onBack={() => setView("form")} />
    return (
      <FormPage
        key={session.user.id}
        session={session}
        onOpenDashboard={() => setView("dashboard")}
        onOpenAdmin={() => setView("admin")}
      />
    )
  }

  return (
    <>
      {content()}
      <Toaster position="top-center" richColors />
    </>
  )
}
