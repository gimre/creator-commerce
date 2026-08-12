import type { Metadata } from "next"

import { getSellerSales, getSellerTotals } from "@/lib/server/dal/purchases"
import { requireUser } from "@/lib/server/session"
import { TableCard } from "@/components/table-card"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatPrice } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Sales",
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export default async function SalesPage() {
  const user = await requireUser()
  const [sales, totals] = await Promise.all([
    getSellerSales(user.id),
    getSellerTotals(user.id),
  ])

  // Units are the same rows whatever the currency, so they add up across the
  // groups; revenue does not, which is why the query grouped it in the first
  // place.
  const units = totals.reduce((sum, total) => sum + total.units, 0)

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-4 p-6">
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-[-0.02em]">
          Sales
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders across your storefront, most recent first.
        </p>
      </div>

      {/* No delta badges: there is no prior-period comparison to compute, and a
          hardcoded "+12%" next to real numbers reads as a measurement. */}
      <div className="grid grid-cols-2 gap-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Revenue</CardDescription>
          </CardHeader>
          <CardContent>
            {/* One line per currency. A seller listing in both USD and EUR has
                two revenues, not one sum. */}
            <div className="flex flex-col gap-1.5">
              {totals.length === 0 ? (
                <div className="font-mono text-3xl leading-none font-medium tracking-[-0.02em]">
                  {formatPrice(0, "USD")}
                </div>
              ) : (
                totals.map((total) => (
                  <div
                    key={total.currency}
                    className="font-mono text-3xl leading-none font-medium tracking-[-0.02em]"
                  >
                    {formatPrice(total.revenueInCents, total.currency)}
                  </div>
                ))
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              paid orders, all time
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Units sold</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl leading-none font-medium tracking-[-0.02em]">
              {units}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              paid orders, all time
            </div>
          </CardContent>
        </Card>
      </div>

      <TableCard>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Buyer</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-8 text-center text-muted-foreground"
              >
                No sales yet.
              </TableCell>
            </TableRow>
          ) : (
            sales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell className="font-mono text-[13px] text-muted-foreground">
                  {/* A uuid in full is unreadable and unnecessary here; rows from
                      one checkout share a prefix, which is what the column is
                      for. */}
                  {sale.orderId.slice(0, 8)}
                </TableCell>
                <TableCell className="font-medium">
                  <span className="block max-w-[420px] truncate">
                    {sale.productName}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {sale.buyerEmail}
                </TableCell>
                <TableCell className="text-[13px] text-muted-foreground">
                  {DATE_FORMAT.format(sale.createdAt)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatPrice(sale.priceInCents, sale.currency)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </TableCard>
    </div>
  )
}
