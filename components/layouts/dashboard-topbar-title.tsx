"use client"

import { usePathname } from "next/navigation"

const TITLES: [prefix: string, title: string][] = [
  ["/dashboard", "Dashboard"],
  ["/explore", "Explore"],
  ["/products", "Products"],
  ["/sales", "Sales"],
  ["/purchases", "Purchases"],
  ["/downloads", "Downloads"],
  ["/wishlist", "Wishlist"],
  ["/settings", "Settings"],
  ["/help", "Help"],
]

export function DashboardTopbarTitle() {
  const pathname = usePathname()
  const title = TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Dashboard"
  return (
    <span className="font-heading text-[15px] font-medium tracking-[-0.01em]">
      {title}
    </span>
  )
}
