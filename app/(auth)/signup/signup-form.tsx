"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { signUp } from "@/lib/client/auth"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function SignupForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    setPending(true)
    setError(null)

    const { error } = await signUp.email({
      name: String(formData.get("name")),
      email: String(formData.get("email")),
      password: String(formData.get("password")),
      handle: String(formData.get("handle")),
    })

    if (error) {
      setError(error.message ?? "Could not create your account. Please try again.")
      setPending(false)
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit}>
      <CardContent className="flex flex-col gap-3.5">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Gabi Ionescu"
            required
          />
        </div>
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
          <Label htmlFor="handle">Storefront handle</Label>
          <Input
            id="handle"
            name="handle"
            placeholder="gabi"
            pattern="[a-z0-9_-]{3,30}"
            title="3–30 characters: lowercase letters, numbers, hyphens or underscores."
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="mt-1 w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </form>
  )
}
