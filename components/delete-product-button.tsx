"use client"

import { useTransition, type ReactElement } from "react"

import { deleteProductAction } from "@/lib/actions/products"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export function DeleteProductButton({
  productId,
  productName,
  trigger,
}: {
  productId: number
  productName?: string
  // The element that opens the dialog. Caller owns its look (and any Tooltip
  // wrapping), so it forwards to a real DOM node the dialog can anchor to.
  trigger: ReactElement
}) {
  const [isPending, startTransition] = useTransition()

  function confirmDelete() {
    // Fires directly in a transition (no nested <form>) so it's safe inside the
    // edit screen's form. The action redirects to /products, which unmounts
    // this dialog on success.
    startTransition(async () => {
      await deleteProductAction(String(productId))
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete product?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes
            {productName ? ` “${productName}”` : " this product"}. This can&apos;t
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={confirmDelete}
          >
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
