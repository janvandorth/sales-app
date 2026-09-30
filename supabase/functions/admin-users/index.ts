import type { User } from "@supabase/supabase-js"
import { z } from "zod"
import type { AdminUser } from "../_shared/admin-types.ts"
import { requireUser } from "../_shared/auth.ts"
import { HttpError, json, serve } from "../_shared/http.ts"
import { createAdminClient } from "../_shared/supabase.ts"

const profileFields = {
  wervernaam: z.string().trim().min(1, "Vul de wervernaam in").max(100),
  wervernr: z.string().trim().min(1, "Vul het wervernummer in").max(50),
  isAdmin: z.boolean(),
}

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("invite"),
    email: z.email("Ongeldig e-mailadres"),
    redirectTo: z.url(),
    ...profileFields,
  }),
  z.object({ action: z.literal("update"), id: z.uuid(), ...profileFields }),
  z.object({ action: z.literal("resendInvite"), id: z.uuid(), redirectTo: z.url() }),
  z.object({ action: z.literal("setDisabled"), id: z.uuid(), disabled: z.boolean() }),
])

/** Supabase blocks a user "forever" by banning for 100 years. */
const BAN_FOREVER = "876000h"

const admin = createAdminClient()

serve(async (req) => {
  const { user: caller } = await requireUser(req)
  const { data: callerProfile } = await admin.from("profiles").select("is_admin").eq("id", caller.id).single()
  if (!callerProfile?.is_admin) throw new HttpError(403, "Geen beheerrechten")

  const parsed = requestSchema.safeParse(await req.json())
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Ongeldig verzoek")
  const body = parsed.data

  switch (body.action) {
    case "list":
      return json({ users: await listUsers() })

    case "invite": {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(body.email, {
        data: { wervernaam: body.wervernaam, wervernr: body.wervernr },
        redirectTo: body.redirectTo,
      })
      if (error?.code === "email_exists") throw new HttpError(409, "Er bestaat al een gebruiker met dit e-mailadres")
      if (error) throw new HttpError(400, error.message)
      // The on_auth_user_created trigger created the profile from the metadata; only the admin flag is left.
      if (body.isAdmin) {
        await updateProfile(caller.id, data.user.id, { wervernaam: body.wervernaam, wervernr: body.wervernr, isAdmin: true })
      }
      return json({ ok: true })
    }

    case "update": {
      if (body.id === caller.id && !body.isAdmin) throw new HttpError(400, "Je kunt je eigen beheerrechten niet intrekken")
      await updateProfile(caller.id, body.id, body)
      return json({ ok: true })
    }

    case "resendInvite": {
      const { data, error } = await admin.auth.admin.getUserById(body.id)
      if (error || !data.user.email) throw new HttpError(404, "Gebruiker niet gevonden")
      if (data.user.email_confirmed_at) throw new HttpError(400, "Deze gebruiker heeft de uitnodiging al geaccepteerd")
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(data.user.email, {
        data: data.user.user_metadata,
        redirectTo: body.redirectTo,
      })
      if (inviteError) throw new HttpError(400, inviteError.message)
      return json({ ok: true })
    }

    case "setDisabled": {
      if (body.id === caller.id) throw new HttpError(400, "Je kunt jezelf niet blokkeren")
      const { error } = await admin.auth.admin.updateUserById(body.id, {
        ban_duration: body.disabled ? BAN_FOREVER : "none",
      })
      if (error) throw new HttpError(400, error.message)
      return json({ ok: true })
    }
  }
})

async function listUsers(): Promise<AdminUser[]> {
  const users: User[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) break
  }

  const [{ data: profiles, error: profilesError }, { data: counts, error: countsError }] = await Promise.all([
    admin.from("profiles").select("id, wervernaam, wervernr, is_admin"),
    admin.rpc("submission_counts"),
  ])
  if (profilesError) throw profilesError
  if (countsError) throw countsError

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const submissionCount = new Map<string, number>(
    (counts as { user_id: string; submissions: number }[]).map((row) => [row.user_id, Number(row.submissions)]),
  )

  return users
    .map((user): AdminUser => {
      const profile = profileById.get(user.id)
      const banned = user.banned_until ? new Date(user.banned_until) > new Date() : false
      return {
        id: user.id,
        email: user.email ?? "",
        wervernaam: profile?.wervernaam ?? "",
        wervernr: profile?.wervernr ?? "",
        isAdmin: profile?.is_admin ?? false,
        status: banned ? "disabled" : user.email_confirmed_at ? "active" : "invited",
        invitedAt: user.invited_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        submissions: submissionCount.get(user.id) ?? 0,
      }
    })
    .sort((a, b) => a.wervernaam.localeCompare(b.wervernaam, "nl"))
}

/** Updates a profile through the database function that records the acting admin in the audit log. */
async function updateProfile(
  actorId: string,
  profileId: string,
  profile: { wervernaam: string; wervernr: string; isAdmin: boolean },
) {
  const { error } = await admin.rpc("update_profile_as_admin", {
    p_actor: actorId,
    p_profile_id: profileId,
    p_wervernaam: profile.wervernaam,
    p_wervernr: profile.wervernr,
    p_is_admin: profile.isAdmin,
  })
  if (error?.code === "23505") throw new HttpError(409, "Dit wervernummer is al in gebruik")
  if (error) throw error
}
