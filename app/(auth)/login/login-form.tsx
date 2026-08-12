"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { signIn } from "@/lib/client/auth"
import { authPathWithNext } from "@/lib/schemas/auth"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// `next` arrives already validated from the page — see lib/schemas/auth.ts.
// Deliberately not better-auth's own `callbackURL`: it navigates via
// window.location.href, a full reload that would race the router.push below, and
// on signUp.email it is discarded entirely unless email verification is on.
export function LoginForm({ next }: { next: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    setPending(true)
    setError(null)

    const { error } = await signIn.email({
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    })

    if (error) {
      setError(error.message ?? "Could not sign you in. Please try again.")
      setPending(false)
      return
    }

    router.push(next)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit}>
      <CardContent className="flex flex-col gap-3.5">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <a href="#" className="text-[13px] text-primary hover:underline">
              Forgot?
            </a>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="mt-1 w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link
            href={authPathWithNext("/signup", next)}
            className="text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
      </CardContent>
    </form>
  )
}
