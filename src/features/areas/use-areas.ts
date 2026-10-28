import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createAreaAssignment, deleteAreaAssignment, listAreaAssignments, listRecruiters } from "@/lib/api"
import type { NewAreaAssignment } from "./areas"

const AREAS_KEY = "area-assignments"

/** The areas that run on any day from..to that the user may see. */
export function useAreaAssignments(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: [AREAS_KEY, from, to],
    queryFn: () => listAreaAssignments(from, to),
    enabled,
  })
}

/** Admins only: the wervers an area can be given to. */
export function useRecruiters(enabled: boolean) {
  return useQuery({ queryKey: ["recruiters"], queryFn: listRecruiters, enabled, staleTime: 10 * 60_000 })
}

/** Gives out an area; every list of areas is fetched again. */
export function useCreateAreaAssignment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: NewAreaAssignment) => createAreaAssignment(input),
    onSuccess: () => client.invalidateQueries({ queryKey: [AREAS_KEY] }),
  })
}

/** Takes an area back; every list of areas is fetched again. */
export function useDeleteAreaAssignment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAreaAssignment(id),
    onSuccess: () => client.invalidateQueries({ queryKey: [AREAS_KEY] }),
  })
}
