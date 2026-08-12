import type { Metadata } from "next"

import { nextPathSchema } from "@/lib/schemas/auth"
import {
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: "Log in",
}

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  // Parsed here rather than with useSearchParams() in the form: the value is
  // validated before it ever reaches the client, and reading it on the server
  // avoids the Suspense boundary useSearchParams() would require.
  const next = nextPathSchema.parse((await searchParams).next)

  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>
          Sign in to your Creator Commerce account.
        </CardDescription>
      </CardHeader>
      <LoginForm next={next} />
    </>
  )
}
