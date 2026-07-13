"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  EyeIcon,
  EyeSlashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { FacebookIcon, GoogleIcon } from "@/components/brand-icons"

type Errors = { email?: string; password?: string }
type Status =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginForm({ className }: { className?: string }) {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [remember, setRemember] = React.useState(true)
  const [errors, setErrors] = React.useState<Errors>({})
  const [pending, setPending] = React.useState(false)
  const [status, setStatus] = React.useState<Status>({ kind: "idle" })
  const [social, setSocial] = React.useState<"google" | "facebook" | null>(null)

  function validate(): Errors {
    const next: Errors = {}
    if (!email.trim()) next.email = "Introdu adresa de email."
    else if (!EMAIL_RE.test(email)) next.email = "Adresa de email nu pare validă."
    if (!password) next.password = "Introdu parola."
    else if (password.length < 8)
      next.password = "Parola trebuie să aibă cel puțin 8 caractere."
    return next
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus({ kind: "idle" })
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setPending(true)
    // TODO: conectează auth real (server action + sesiune). Momentan e doar UI.
    await new Promise((r) => setTimeout(r, 1100))
    setPending(false)
    setStatus({
      kind: "success",
      message: "Autentificare simulată reușită. (Demo UI — fără backend.)",
    })
  }

  async function handleSocial(provider: "google" | "facebook") {
    setStatus({ kind: "idle" })
    setSocial(provider)
    // TODO: declanșează fluxul OAuth real pentru provider.
    await new Promise((r) => setTimeout(r, 900))
    setSocial(null)
    setStatus({
      kind: "success",
      message: `Flux ${provider === "google" ? "Google" : "Facebook"} simulat. (Demo UI.)`,
    })
  }

  const busy = pending || social !== null

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn("flex flex-col gap-5", className)}
    >
      {/* Social auth */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={busy}
          onClick={() => handleSocial("google")}
        >
          {social === "google" ? (
            <CircleNotchIcon className="animate-spin" />
          ) : (
            <GoogleIcon className="size-4" />
          )}
          Google
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={busy}
          onClick={() => handleSocial("facebook")}
        >
          {social === "facebook" ? (
            <CircleNotchIcon className="animate-spin" />
          ) : (
            <FacebookIcon className="size-4" />
          )}
          Facebook
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          sau cu email-ul
        </span>
        <Separator className="flex-1" />
      </div>

      {/* Status banner */}
      {status.kind !== "idle" && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm",
            status.kind === "error" && "text-destructive"
          )}
        >
          {status.kind === "success" ? (
            <CheckCircleIcon className="mt-0.5 size-4 text-muted-foreground" />
          ) : (
            <WarningCircleIcon className="mt-0.5 size-4" />
          )}
          <span>{status.message}</span>
        </div>
      )}

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="nume@exemplu.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          disabled={busy}
          className="h-10"
        />
        {errors.email && (
          <p id="email-error" className="text-xs text-destructive">
            {errors.email}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Parolă</Label>
          <Link
            href="/login"
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Ai uitat parola?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            disabled={busy}
            className="h-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={busy}
            aria-label={showPassword ? "Ascunde parola" : "Arată parola"}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none"
          >
            {showPassword ? (
              <EyeSlashIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p id="password-error" className="text-xs text-destructive">
            {errors.password}
          </p>
        )}
      </div>

      {/* Remember me */}
      <Label
        htmlFor="remember"
        className="w-fit cursor-pointer text-sm font-normal text-muted-foreground"
      >
        <Checkbox
          id="remember"
          checked={remember}
          onCheckedChange={(checked) => setRemember(checked === true)}
          disabled={busy}
        />
        Ține-mă minte 30 de zile
      </Label>

      {/* Submit */}
      <Button type="submit" size="lg" disabled={busy} className="h-10">
        {pending ? (
          <>
            <CircleNotchIcon className="animate-spin" />
            Se conectează…
          </>
        ) : (
          <>
            Conectează-te
            <ArrowRightIcon data-icon="inline-end" />
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Nu ai cont?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Înregistrează-te
        </Link>
      </p>
    </form>
  )
}
