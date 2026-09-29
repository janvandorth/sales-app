import { FormPage } from "@/components/form-page"
import { LoginPage } from "@/components/login-page"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { useSession } from "@/hooks/use-session"

export default function App() {
  const { session, loading } = useSession()

  return (
    <>
      {loading ? (
        <div className="flex min-h-svh items-center justify-center">
          <Spinner className="size-6" />
        </div>
      ) : session ? (
        <FormPage key={session.user.id} session={session} />
      ) : (
        <LoginPage />
      )}
      <Toaster position="top-center" richColors />
    </>
  )
}
