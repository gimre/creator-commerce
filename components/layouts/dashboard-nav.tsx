"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CircleHelp,
  Compass,
  Download,
  Heart,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type NavItem = { label: string; href: string; icon: LucideIcon }

const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Selling",
    items: [
      { label: "Products", href: "/products", icon: Package },
      { label: "Sales", href: "/sales", icon: TrendingUp },
    ],
  },
  {
    label: "Buying",
    items: [
      { label: "Explore", href: "/explore", icon: Compass },
      { label: "Purchases", href: "/purchases", icon: Receipt },
      { label: "Downloads", href: "/downloads", icon: Download },
      { label: "Wishlist", href: "/wishlist", icon: Heart },
    ],
  },
]

const FOOTER_NAV: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Help", href: "/help/first-sale", icon: CircleHelp },
]

function NavMenu({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <SidebarMenu>
      {items.map(({ label, href, icon: Icon }) => (
        <SidebarMenuItem key={href}>
          <SidebarMenuButton
            tooltip={label}
            isActive={pathname === href || pathname.startsWith(`${href}/`)}
            render={<Link href={href} />}
          >
            <Icon />
            <span>{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

export function DashboardNavGroups() {
  return (
    <>
      {NAV_GROUPS.map((group, i) => (
        <SidebarGroup key={group.label ?? i}>
          {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <NavMenu items={group.items} />
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}

export function DashboardFooterNav() {
  return <NavMenu items={FOOTER_NAV} />
}
