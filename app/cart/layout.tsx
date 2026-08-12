import { CartShell } from "@/components/layouts/cart-shell"

export default function CartLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <CartShell>{children}</CartShell>
}
