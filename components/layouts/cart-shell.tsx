import Link from "next/link"

import { getUser } from "@/lib/server/session"
import { authPathWithNext } from "@/lib/schemas/auth"
import { Logo, Wordmark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { getInitials } from "@/lib/utils"

/**
 * Header for the public cart page.
 *
 * Its own shell rather than MarketingShell: a cart spans sellers, so the
 * storefront's seller identity is wrong, and the landing page's section nav and
 * "Start selling" pitch are noise in the middle of buying something. No
 * CartBadge either — you are looking at the cart.
 */
export async function CartShell({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getUser()

  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3.5 px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={28} />
            <Wordmark className="text-[17px]" />
          </Link>
          <div className="flex-1" />
          {user ? (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-chart-1 text-[10px] font-bold">
                {getInitials(user.name)}
              </span>
              Dashboard
            </Button>
          ) : (
            // Carries the return path, so signing in from here comes back to the
            // cart rather than dumping the visitor on the dashboard.
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={authPathWithNext("/login", "/cart")} />}
            >
              Sign in
            </Button>
          )}
        </div>
      </header>
      {children}
    </>
  )
}
