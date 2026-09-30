import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { adminApi } from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

const ADMIN_USERS_KEY = ["admin-users"] as const

/** The recruiter list for the admin page. */
export function useAdminUsers() {
  return useQuery({ queryKey: ADMIN_USERS_KEY, queryFn: adminApi.list })
}

/**
 * A change to a recruiter (invite, edit, block, …): shows a toast and reloads the list afterwards.
 * Errors are shown as a toast unless the caller handles them (e.g. inside a dialog).
 */
export function useAdminAction<TArgs>(action: (args: TArgs) => Promise<unknown>, options: { toastErrors?: boolean } = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: action,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
    onError: (error) => {
      if (options.toastErrors ?? true) toast.error(getErrorMessage(error))
    },
  })
}
