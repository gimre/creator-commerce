import type { Metadata } from "next"
import { SparkleIcon } from "@phosphor-icons/react/ssr"

import { LoginBrandPanel } from "@/components/login-brand-panel"
import { LoginForm } from "@/components/login-form"

export const metadata: Metadata = {
  title: "Autentificare · Creator Commerce",
  description: "Conectează-te în contul tău Creator Commerce.",
}

export default function LoginPage() {
  return (
    <main className="login-japandi grid min-h-dvh bg-background lg:grid-cols-2">
      <LoginBrandPanel />

      <div className="flex flex-col justify-center px-6 py-10 sm:px-10">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
          {/* Wordmark — visible on mobile where the brand panel is hidden */}
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <SparkleIcon weight="fill" className="size-4" />
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight">
              Creator Commerce
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Bine ai revenit
            </h1>
            <p className="text-sm text-muted-foreground">
              Conectează-te ca să-ți gestionezi magazinul și clienții.
            </p>
          </div>

          <LoginForm />

          <p className="text-center text-xs text-muted-foreground text-balance">
            Continuând, ești de acord cu{" "}
            <a
              href="/login"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Termenii
            </a>{" "}
            și{" "}
            <a
              href="/login"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Politica de confidențialitate
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  )
}
