import type { Metadata } from "next"
import Link from "next/link"
import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "How to sell your first product",
}

const STEPS = [
  {
    title: "Upload your file",
    body: "Go to Products → New product and drop in your ZIP, PDF, or audio file — anything up to 2 GB. That file is what buyers get the moment they pay.",
  },
  {
    title: "Set a price",
    body: "Pick a price in RON. Simple round numbers convert best when you're starting out — you can change it anytime.",
  },
  {
    title: "Publish to your storefront",
    body: "Flip the product from Draft to Published and it appears on your public page immediately.",
  },
  {
    title: "Connect Stripe to get paid",
    body: "One-time setup in Settings. Payments land straight in your Stripe account — there's no payout schedule to wait on.",
  },
  {
    title: "Share your storefront link",
    body: "Your whole shop is one link. Put it in your bio, your videos, your newsletter — everywhere your audience already is.",
  },
]

export default function FirstSalePage() {
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8 p-6 pb-16">
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-[-0.02em]">
          How to sell your first product
        </h1>
        <p className="mt-1.5 max-w-[60ch] text-[15px] text-muted-foreground">
          From file to first payout in five steps. Most creators finish this in
          under ten minutes.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex gap-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-mono font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <div className="pt-1">
              <h2 className="font-heading text-lg font-medium">{step.title}</h2>
              <p className="mt-1 text-sm leading-[1.55] text-muted-foreground">
                {step.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
        <Sparkles className="size-[18px] shrink-0 text-primary" />
        <p className="flex-1 text-[13px]">
          Short on time? Upload your file and let the AI draft the product page
          — description and teaser included.
        </p>
      </div>

      <div>
        <Button nativeButton={false} render={<Link href="/products/new" />}>
          Create your first product
        </Button>
      </div>
    </div>
  )
}
