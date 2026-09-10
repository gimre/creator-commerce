"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { signOut } from "@/lib/client/auth"
import { resetPostHog } from "@/lib/client/posthog"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onSignOut() {
    setPending(true)
    await signOut()
    // A shared machine otherwise attributes the next visitor's whole funnel to
    // whoever signed out last. reset() issues a fresh anonymous id rather than
    // clearing to nothing, so the next person is tracked, just not as this one.
    resetPostHog()
    router.push("/login")
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip="Sign out"
          disabled={pending}
          onClick={onSignOut}
        >
          <LogOut />
          <span>{pending ? "Signing out…" : "Sign out"}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
