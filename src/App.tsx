import { lazy, Suspense, useState } from "react"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { AdminPage } from "@/features/admin/admin-page"
import { LoginPage } from "@/features/auth/login-page"
import { SetPasswordPage } from "@/features/auth/set-password-page"
import { useSession } from "@/features/auth/use-session"
import { DashboardPage } from "@/features/dashboard/dashboard-page"
import { FormPage } from "@/features/sales-form/form-page"
import { SalesListPage } from "@/features/sales-list/sales-list-page"
import { useProfile } from "@/hooks/use-profile"
import { DEMO_MODE } from "@/lib/api"
import { IS_TEST_DEPLOYMENT } from "@/lib/deployment"

// Loaded on first use: MapLibre is large and the sales form should not wait for it.
const SalesMapPage = lazy(() => import("@/features/sales-map/map-page").then((m) => ({ default: m.SalesMapPage })))

const pageSpinner = (
  <div className="flex min-h-svh items-center justify-center">
    <Spinner className="size-6" />
  </div>
)

export default function App() {
  const { session, loading, needsPassword, isInvite, passwordSet } = useSession()
  const [view, setView] = useState<"form" | "dashboard" | "map" | "sales" | "admin">("form")
  const profile = useProfile(session?.user.id)

  function content() {
    if (import.meta.env.DEV && DEMO_MODE) {
      const demoProfile = { wervernaam: "Jan van Dorth", wervernr: "0212BB", isAdmin: DEMO_MODE === "admin" }
      // `?demo&verkopen` shows the sales list instead of the dashboard, `?demo&kaart` the sales map.
      if (new URLSearchParams(window.location.search).has("verkopen")) {
        return <SalesListPage profile={demoProfile} userId={undefined} onBack={() => {}} />
      }
      if (new URLSearchParams(window.location.search).has("kaart")) {
        return (
          <Suspense fallback={pageSpinner}>
            <SalesMapPage onBack={() => {}} />
          </Suspense>
        )
      }
      return <DashboardPage profile={demoProfile} onBack={() => {}} />
    }
    if (loading) return pageSpinner
    if (!session) return <LoginPage />
    if (needsPassword) {
      return <SetPasswordPage email={session.user.email ?? ""} isInvite={isInvite} onDone={passwordSet} />
    }
    if (view === "dashboard") return <DashboardPage profile={profile} onBack={() => setView("form")} />
    if (view === "map") {
      return (
        <Suspense fallback={pageSpinner}>
          <SalesMapPage onBack={() => setView("form")} />
        </Suspense>
      )
    }
    if (view === "sales") {
      return <SalesListPage profile={profile} userId={session.user.id} onBack={() => setView("form")} />
    }
    if (view === "admin") return <AdminPage currentUserId={session.user.id} onBack={() => setView("form")} />
    return (
      <FormPage
        key={session.user.id}
        session={session}
        onOpenDashboard={() => setView("dashboard")}
        onOpenMap={() => setView("map")}
        onOpenSales={() => setView("sales")}
        onOpenAdmin={() => setView("admin")}
      />
    )
  }

  return (
    <>
      {IS_TEST_DEPLOYMENT && (
        <div className="bg-amber-500 px-4 py-1 text-center text-sm font-medium text-black">
          TESTOMGEVING · verkopen gaan naar de testomgeving van ZMAdmin
        </div>
      )}
      {content()}
      <Toaster position="top-center" richColors />
    </>
  )
}
