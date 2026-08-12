import Link from "next/link"
import { ExternalLink } from "lucide-react"

import { requireUser } from "@/lib/server/session"
import { getInitials } from "@/lib/utils"
import { Logo, Wordmark } from "@/components/logo"
import {
  DashboardFooterNav,
  DashboardNavGroups,
} from "@/components/layouts/dashboard-nav"
import { SignOutButton } from "@/components/layouts/sign-out-button"
import { DashboardTopbarTitle } from "@/components/layouts/dashboard-topbar-title"
import { CartBadge } from "@/components/cart-badge"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export async function DashboardShell({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await requireUser()
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link href="/dashboard" className="flex h-10 items-center gap-2 px-1">
            <Logo size={26} />
            <Wordmark className="text-[15px] group-data-[collapsible=icon]:hidden" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <DashboardNavGroups />
        </SidebarContent>
        <SidebarFooter>
          <DashboardFooterNav />
          <SignOutButton />
          <div className="flex items-center gap-2 p-1">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-chart-1 text-[11px] font-bold">
              {getInitials(user.name)}
            </span>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="text-[13px] leading-tight font-medium">{user.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                @{user.handle}
              </span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <DashboardTopbarTitle />
          <div className="flex-1" />
          <CartBadge />
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/@${user.handle}`} />}>
            <ExternalLink /> View storefront
          </Button>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
