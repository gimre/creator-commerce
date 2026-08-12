import type { Metadata } from "next"
import Link from "next/link"
import { Download } from "lucide-react"

import { getBuyerPurchases } from "@/lib/server/dal/purchases"
import { requireUser } from "@/lib/server/session"
import { TableCard } from "@/components/table-card"
import { Button } from "@/components/ui/button"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatPrice } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Purchases",
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export default async function PurchasesPage() {
  const user = await requireUser()
  const purchases = await getBuyerPurchases(user.id)

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-4 p-6">
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-[-0.02em]">
          Purchases
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your order history. Files live in Downloads.
        </p>
      </div>

      <TableCard>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Creator</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchases.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-8 text-center text-muted-foreground"
              >
                No purchases yet.{" "}
                <Link href="/explore" className="text-foreground underline">
                  Find something to buy
                </Link>
                .
              </TableCell>
            </TableRow>
          ) : (
            purchases.map((purchase) => (
              <TableRow key={purchase.id}>
                <TableCell className="font-medium">
                  {/* The snapshotted name, linking to the product as it is now.
                      The two can differ after a rename — what was bought is the
                      row, where it lives is the link. */}
                  <Link
                    href={`/@${purchase.sellerHandle}/${purchase.productId}/${purchase.productSlug}`}
                    className="block max-w-[420px] truncate hover:underline"
                  >
                    {purchase.productName}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-[13px] text-muted-foreground">
                  {/* Stored without the leading "@"; the url and the label both
                      add it back. */}
                  <Link
                    href={`/@${purchase.sellerHandle}`}
                    className="hover:underline"
                  >
                    @{purchase.sellerHandle}
                  </Link>
                </TableCell>
                <TableCell className="text-[13px] text-muted-foreground">
                  {DATE_FORMAT.format(purchase.createdAt)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatPrice(purchase.priceInCents, purchase.currency)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            nativeButton={false}
                            render={<Link href="/downloads" />}
                          >
                            <Download className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>Go to downloads</TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </TableCard>
    </div>
  )
}
