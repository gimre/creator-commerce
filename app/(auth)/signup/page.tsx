import type { Metadata } from "next"

import { nextPathSchema } from "@/lib/schemas/auth"
import {
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { SignupForm } from "./signup-form"

export const metadata: Metadata = {
  title: "Sign up",
}

export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  // See the note in the login page: validated on the server before it reaches
  // the client.
  const next = nextPathSchema.parse((await searchParams).next)

  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Claim your handle and start selling.</CardDescription>
      </CardHeader>
      <SignupForm next={next} />
    </>
  )
}
