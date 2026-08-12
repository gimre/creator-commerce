import type { Metadata } from "next"
import { z } from "zod"
import { Check, Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Payment confirmed",
}

// `.catch()` per the house style for url-sourced input: the param is
// hand-editable and grants nothing, so a junk value should render a sane page
// rather than throw. The count travels in the url because checkoutAction has
// already cleared the cart cookie by the time this renders.
const itemsSchema = z.coerce.number().int().min(1).catch(1)

export default async function CheckoutSuccessPage({
  searchParams,
}: PageProps<"/checkout/success">) {
  const { items } = await searchParams
  const count = itemsSchema.parse(items)

  return (
    <CardContent className="flex flex-col items-center gap-3.5 text-center">
      <span className="flex size-13 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Check className="size-6.5" />
      </span>
      <h1 className="font-heading text-xl font-medium">Payment confirmed</h1>
      <p className="text-sm text-muted-foreground">
        Thanks!{" "}
        <b className="text-foreground">
          {count} {count === 1 ? "product" : "products"}
        </b>{" "}
        {count === 1 ? "is" : "are"} ready to download.
      </p>
      <Button className="w-full">
        <Download /> Go to downloads
      </Button>
    </CardContent>
  )
}
