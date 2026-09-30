import type { AdminUser } from "@shared/admin-types"
import { Badge } from "@/components/ui/badge"

export function StatusBadge({ status }: { status: AdminUser["status"] }) {
  switch (status) {
    case "active":
      return <Badge variant="secondary">Actief</Badge>
    case "invited":
      return <Badge variant="outline">Uitgenodigd</Badge>
    case "disabled":
      return <Badge variant="destructive">Geblokkeerd</Badge>
  }
}
