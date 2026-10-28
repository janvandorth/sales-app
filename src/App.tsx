import { lazy, Suspense, useState } from "react"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { AdminPage } from "@/features/admin/admin-page"
import type { AreaAssignment, AreaMember, AssignStart } from "@/features/areas/areas"
import type { Door } from "@/features/areas/doors"
import { MyAreasPage } from "@/features/areas/my-areas-page"
import { PlanningPage } from "@/features/areas/planning-page"
import { WalkPage } from "@/features/areas/walk-page"
import { LoginPage } from "@/features/auth/login-page"
import { SetPasswordPage } from "@/features/auth/set-password-page"
import { useSession } from "@/features/auth/use-session"
import { DashboardPage } from "@/features/dashboard/dashboard-page"
import { FormPage } from "@/features/sales-form/form-page"
import { SalesListPage } from "@/features/sales-list/sales-list-page"
import { useProfile, type Profile } from "@/hooks/use-profile"
import { DEMO_MODE } from "@/lib/api"
import { IS_TEST_DEPLOYMENT } from "@/lib/deployment"

// Loaded on first use: MapLibre is large and the sales form should not wait for it.
const SalesMapPage = lazy(() => import("@/features/sales-map/map-page").then((m) => ({ default: m.SalesMapPage })))

type View = "form" | "dashboard" | "map" | "sales" | "admin" | "planning" | "areas" | "walk"

/** How the map opens: plain, giving out an area, or on one area; and where its back button goes. */
type MapStart = { assign?: AssignStart; focus?: AreaAssignment; back: View; key: number }

/** Dev only: `?demo&verkopen`, `?demo&kaart`, `?demo&planning` or `?demo=werver&gebieden` opens that page. */
function demoView(): View {
  const params = new URLSearchParams(window.location.search)
  if (params.has("verkopen")) return "sales"
  if (params.has("kaart")) return "map"
  if (params.has("planning")) return "planning"
  if (params.has("gebieden")) return "areas"
  return "dashboard"
}

const pageSpinner = (
  <div className="flex min-h-svh items-center justify-center">
    <Spinner className="size-6" />
  </div>
)

export default function App() {
  const { session, loading, needsPassword, isInvite, passwordSet } = useSession()
  const [view, setView] = useState<View>(() => (import.meta.env.DEV && DEMO_MODE ? demoView() : "form"))
  const [mapStart, setMapStart] = useState<MapStart>({ back: "form", key: 0 })
  /** The werver whose areas a manager opened from the planning; null for one's own. */
  const [viewedAs, setViewedAs] = useState<AreaMember | null>(null)
  /** The area being walked door by door. */
  const [walking, setWalking] = useState<AreaAssignment | null>(null)
  /** The door marked "Verkocht": the sales form opens with its address filled in. */
  const [soldAt, setSoldAt] = useState<Door | null>(null)
  const profile = useProfile(session?.user.id)

  const openMap = (start: Omit<MapStart, "key">) => {
    setMapStart({ ...start, key: mapStart.key + 1 })
    setView("map")
  }

  /** The map and the area pages, which lead to each other; null for any other view. */
  function areaViews(profile: Profile | undefined) {
    if (view === "map") {
      return (
        <Suspense fallback={pageSpinner}>
          <SalesMapPage
            key={mapStart.key}
            isAdmin={profile?.isAdmin}
            assign={mapStart.assign}
            focus={mapStart.focus}
            onBack={() => setView(mapStart.back)}
          />
        </Suspense>
      )
    }
    if (view === "planning") {
      return (
        <PlanningPage
          onBack={() => setView("form")}
          onAssign={(assign) => openMap({ assign, back: "planning" })}
          onShow={(focus) => openMap({ focus, back: "planning" })}
          onViewAs={(werver) => {
            setViewedAs(werver)
            setView("areas")
          }}
        />
      )
    }
    if (view === "areas") {
      return (
        <MyAreasPage
          wervernr={viewedAs?.wervernr ?? profile?.wervernr}
          viewedAs={viewedAs?.name}
          onBack={() => {
            setView(viewedAs ? "planning" : "form")
            setViewedAs(null)
          }}
          onShow={(focus) => openMap({ focus, back: "areas" })}
          onWalk={(area) => {
            setWalking(area)
            setView("walk")
          }}
        />
      )
    }
    if (view === "walk" && walking) {
      return (
        <WalkPage
          area={walking}
          // Doors are logged under whoever walks, also a manager on a werver's page; they count for the area.
          wervernr={profile?.wervernr}
          onBack={() => setView("areas")}
          onSold={(door) => {
            setSoldAt(door)
            setView("form")
          }}
        />
      )
    }
    return null
  }

  function content() {
    if (import.meta.env.DEV && DEMO_MODE) {
      const demoProfile = { wervernaam: "Jan van Dorth", wervernr: "0212BB", isAdmin: DEMO_MODE === "admin" }
      const areaView = areaViews(demoProfile)
      if (areaView) return areaView
      if (view === "sales") return <SalesListPage profile={demoProfile} userId={undefined} onBack={() => {}} />
      return <DashboardPage profile={demoProfile} onBack={() => {}} />
    }
    if (loading) return pageSpinner
    if (!session) return <LoginPage />
    if (needsPassword) {
      return <SetPasswordPage email={session.user.email ?? ""} isInvite={isInvite} onDone={passwordSet} />
    }
    if (view === "dashboard") return <DashboardPage profile={profile} onBack={() => setView("form")} />
    const areaView = areaViews(profile)
    if (areaView) return areaView
    if (view === "sales") {
      return <SalesListPage profile={profile} userId={session.user.id} onBack={() => setView("form")} />
    }
    if (view === "admin") return <AdminPage currentUserId={session.user.id} onBack={() => setView("form")} />
    return (
      <FormPage
        key={session.user.id}
        session={session}
        onOpenDashboard={() => setView("dashboard")}
        onOpenMap={() => openMap({ back: "form" })}
        onOpenAreas={() => setView(profile?.isAdmin ? "planning" : "areas")}
        soldAt={soldAt}
        onSoldAtFilled={() => setSoldAt(null)}
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
