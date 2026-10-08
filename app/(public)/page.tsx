import Link from "next/link"
import {
  ArrowRight,
  AudioLines,
  ChartColumn,
  Check,
  CreditCard,
  Download,
  FileText,
  Package,
  ShieldCheck,
  Sparkles,
  Store,
  type LucideIcon,
} from "lucide-react"

import { MarketingShell } from "@/components/layouts/marketing-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Store,
    title: "Your own storefront",
    body: "A public page at creatorcommerce.com/@you. Share one link; sell everywhere.",
  },
  {
    icon: CreditCard,
    title: "Stripe checkout",
    body: "Take card payments in minutes. Money lands straight in your Stripe account.",
  },
  {
    icon: ShieldCheck,
    title: "Protected downloads",
    body: "Files are locked to the buyer. No leaked links, no manual delivery.",
  },
  {
    icon: Sparkles,
    title: "AI product pages",
    body: "Upload a file and we draft the description and a teaser for you.",
  },
  {
    icon: ChartColumn,
    title: "Sales analytics",
    body: "Revenue, units, and your top products — updated in real time.",
  },
  {
    icon: Download,
    title: "Instant delivery",
    body: "Buyers download the moment payment clears. Zero fulfillment work.",
  },
]

const STEPS = [
  { n: "1", title: "Upload your file", body: "ZIP, PDF, audio — up to 2 GB." },
  { n: "2", title: "Set a price", body: "Publish to your storefront in one click." },
  { n: "3", title: "Get paid", body: "Share your link and start selling." },
]

const PREVIEW_PRODUCTS: { icon: LucideIcon; name: string; price: string; cover: string }[] = [
  { icon: Package, name: "Presets", price: "$29", cover: "#e7e6df" },
  { icon: FileText, name: "Notion OS", price: "$19", cover: "#dfe4dc" },
  { icon: AudioLines, name: "Loops", price: "$12", cover: "#e5e2da" },
]

export default function LandingPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mx-auto flex max-w-[1080px] flex-col items-center gap-[22px] px-6 pt-20 pb-14 text-center">
        <Badge variant="secondary">
          <span className="size-1.5 rounded-full bg-primary" />
          Now with AI product pages
        </Badge>
        <h1 className="max-w-[16ch] font-heading text-[52px] leading-[1.08] font-medium tracking-[-0.03em]">
          Sell your digital products in minutes
        </h1>
        <p className="max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
          Creator Commerce gives every creator a storefront, Stripe checkout,
          and protected downloads — so you can focus on making, not fulfilling.
        </p>
        <div className="mt-1 flex gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            Start selling free <ArrowRight />
          </Button>
          <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/@gabi" />}>
            See a storefront
          </Button>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Check className="size-3.5" />
          No monthly fee to start · you keep what you earn
        </div>

        {/* Product preview strip */}
        <div className="mt-8 w-full overflow-hidden rounded-3xl bg-card ring-1 ring-foreground/10">
          <div className="flex h-[38px] items-center gap-1.5 border-b px-3.5">
            <span className="size-2.5 rounded-full bg-chart-1" />
            <span className="size-2.5 rounded-full bg-chart-1" />
            <span className="size-2.5 rounded-full bg-chart-1" />
            <span className="ml-3 font-mono text-xs text-muted-foreground">
              creatorcommerce.com/@gabi
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 p-6">
            {PREVIEW_PRODUCTS.map(({ icon: Icon, name, price, cover }) => (
              <div key={name} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                <div
                  className="flex aspect-[3/2] items-center justify-center text-muted-foreground"
                  style={{
                    background: `linear-gradient(135deg, ${cover}, color-mix(in oklch, ${cover}, black 8%))`,
                  }}
                >
                  <Icon className="size-6" />
                </div>
                <div className="flex items-center justify-between p-3.5 text-left">
                  <span className="text-[13px] font-medium">{name}</span>
                  <span className="font-mono text-sm font-medium">{price}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-y bg-muted">
        <div className="mx-auto max-w-[1080px] px-6 py-16">
          <p className="text-center text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Everything you need
          </p>
          <h2 className="mt-2 mb-10 text-center font-heading text-[32px] font-medium tracking-[-0.02em]">
            One tool from upload to payout
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title}>
                <CardContent className="flex flex-col gap-2.5 p-5">
                  <span className="flex size-[38px] items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-[19px]" />
                  </span>
                  <span className="font-heading text-base font-medium">{title}</span>
                  <span className="text-sm leading-[1.55] text-muted-foreground">{body}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1080px] px-6 py-16">
        <p className="text-center text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          How it works
        </p>
        <h2 className="mt-2 mb-10 text-center font-heading text-[32px] font-medium tracking-[-0.02em]">
          Live in three steps
        </h2>
        <div className="grid grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <div key={step.n} className="flex flex-col gap-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary font-mono font-semibold text-primary-foreground">
                {step.n}
              </span>
              <span className="font-heading text-lg font-medium">{step.title}</span>
              <span className="text-sm leading-[1.55] text-muted-foreground">{step.body}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto mb-16 max-w-[1080px] px-6">
        <div className="flex flex-col items-center gap-[18px] rounded-3xl bg-foreground px-8 py-13 text-center text-background">
          <h2 className="font-heading text-[34px] font-medium tracking-[-0.02em]">
            Start selling today
          </h2>
          <p className="max-w-[46ch] text-background/70">
            Create your storefront in minutes. No monthly fee — you only pay
            when you get paid.
          </p>
          <Button
            size="lg"
            className="bg-sidebar-primary text-primary-foreground hover:bg-sidebar-primary/80"
            nativeButton={false}
            render={<Link href="/signup" />}
          >
            Create your storefront <ArrowRight />
          </Button>
        </div>
      </section>
    </MarketingShell>
  )
}
