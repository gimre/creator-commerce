import Link from "next/link"
import { Heart } from "lucide-react"

import type { PublicUser } from "@/lib/server/dal/users"
import { Button } from "@/components/ui/button"
import { getInitials } from "@/lib/utils"

export function StorefrontShell({
  seller,
  children,
}: Readonly<{
  seller: PublicUser
  children: React.ReactNode
}>) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3.5 px-6 py-3.5">
          <Link href={`/@${seller.handle}`} className="flex items-center gap-3">
            {/* Initials only for now: nothing populates user.image yet, and an
                arbitrary avatar host isn't in next.config's remotePatterns. */}
            <span className="flex size-10 items-center justify-center rounded-full bg-chart-1 font-heading text-base font-bold">
              {getInitials(seller.name)}
            </span>
            <div className="flex flex-col">
              <span className="font-heading text-base leading-tight font-medium tracking-[-0.01em]">
                {seller.name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                @{seller.handle}
              </span>
            </div>
          </Link>
          <div className="flex-1" />
          <Button variant="outline" size="sm">
            <Heart /> Wishlist
          </Button>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/login" />}>
            Sign in
          </Button>
        </div>
      </header>
      {children}
    </>
  )
}
