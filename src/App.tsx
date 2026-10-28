import { lazy, Suspense, useState } from "react"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { AdminPage } from "@/features/admin/admin-page"
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
import { IS_TEST_DEPLOYMENT, WALK_AS_WERVER } from "@/lib/deployment"
import { pageFromUrl, useNavigation, type MapStart, type Page, type View } from "@/lib/navigation"

// Loaded on first use: MapLibre is large and the sales form should not wait for it.
const SalesMapPage = lazy(() => import("@/features/sales-map/map-page").then((m) => ({ default: m.SalesMapPage })))

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

const FORM: Page = { view: "form" }

export default function App() {
  const { session, loading, needsPassword, isInvite, passwordSet } = useSession()
  const { page, go, back } = useNavigation(() =>
    import.meta.env.DEV && DEMO_MODE
      ? { view: demoView(), map: { key: 0 } }
      : pageFromUrl(window.location.pathname, window.location.search),
  )
  const { view, viewedAs, walking } = page
  /** The door marked "Verkocht": the sales form opens with its address filled in. */
  const [soldAt, setSoldAt] = useState<Door | null>(null)
  const profile = useProfile(session?.user.id)

  const openMap = (map: Omit<MapStart, "key">) => go({ view: "map", map: { ...map, key: Date.now() } })

  /** The map and the area pages, which lead to each other; null for any other view. */
  function areaViews(profile: Profile | undefined) {
    if (view === "map") {
      const map = page.map ?? { key: 0 }
      return (
        <Suspense fallback={pageSpinner}>
          <SalesMapPage
            key={map.key}
            isAdmin={profile?.isAdmin}
            assign={map.assign}
            focus={map.focus}
            onBack={() => back(FORM)}
          />
        </Suspense>
      )
    }
    if (view === "planning") {
      return (
        <PlanningPage
          onBack={() => back(FORM)}
          onAssign={(assign) => openMap({ assign })}
          onShow={(focus) => openMap({ focus })}
          onViewAs={(werver) => go({ view: "areas", viewedAs: werver })}
        />
      )
    }
    if (view === "areas") {
      return (
        <MyAreasPage
          wervernr={viewedAs?.wervernr ?? profile?.wervernr}
          viewedAs={viewedAs?.name}
          onBack={() => back(viewedAs ? { view: "planning" } : FORM)}
          onShow={(focus) => openMap({ focus })}
          onWalk={(area) => go({ view: "walk", walking: area, viewedAs })}
        />
      )
    }
    if (view === "walk" && walking) {
      return (
        <WalkPage
          area={walking}
          // Doors are logged under whoever walks; on the test deployment a manager on a werver's page walks as them.
          wervernr={(WALK_AS_WERVER && viewedAs?.wervernr) || profile?.wervernr}
          onBack={() => back({ view: "areas", viewedAs })}
          onSold={(door) => {
            setSoldAt(door)
            go(FORM)
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
      if (view === "sales") return <SalesListPage profile={demoProfile} userId={undefined} onBack={() => back(FORM)} />
      return <DashboardPage profile={demoProfile} onBack={() => back(FORM)} />
    }
    if (loading) return pageSpinner
    if (!session) return <LoginPage />
    if (needsPassword) {
      return <SetPasswordPage email={session.user.email ?? ""} isInvite={isInvite} onDone={passwordSet} />
    }
    if (view === "dashboard") return <DashboardPage profile={profile} onBack={() => back(FORM)} />
    const areaView = areaViews(profile)
    if (areaView) return areaView
    if (view === "sales") {
      return <SalesListPage profile={profile} userId={session.user.id} onBack={() => back(FORM)} />
    }
    if (view === "admin") return <AdminPage currentUserId={session.user.id} onBack={() => back(FORM)} />
    return (
      <FormPage
        key={session.user.id}
        session={session}
        onOpenDashboard={() => go({ view: "dashboard" })}
        onOpenMap={() => openMap({})}
        onOpenAreas={() => go({ view: profile?.isAdmin ? "planning" : "areas" })}
        soldAt={soldAt}
        onSoldAtFilled={() => setSoldAt(null)}
        onOpenSales={() => go({ view: "sales" })}
        onOpenAdmin={() => go({ view: "admin" })}
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
