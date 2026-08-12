"use client"

import { useActionState, useEffect, startTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import Link from "next/link"
import { ChevronLeft, Trash2 } from "lucide-react"

import type { ProductFormState } from "@/lib/actions/products"
import { APP_CURRENCY } from "@/lib/currency"
import { createProductSchema } from "@/lib/schemas/product"
import { DeleteProductButton } from "@/components/delete-product-button"
import {
  ProductFileField,
  ProductFileSummary,
  useProductFileUpload,
} from "@/components/product-file"
import { ProductImages } from "@/components/product-images"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type ProductFormAction = (
  state: ProductFormState,
  formData: FormData,
) => Promise<ProductFormState>

// Form binds raw input (price as a string); the resolver coerces to output.
type FormValues = z.input<typeof createProductSchema>
type ProductStatus = z.output<typeof createProductSchema>["status"]

export function ProductForm({
  action,
  product,
  productId,
  images = [],
  file,
}: {
  action: ProductFormAction
  // Prefill/display values for the edit case, in the client-safe form shape.
  product?: FormValues
  // Present only when editing an existing product; enables the delete button
  // and image uploads.
  productId?: number
  images?: string[]
  // The product's digital file, when editing. Absent for a new product, which
  // uploads one here, and for the rows that predate the feature.
  file?: { name: string; sizeBytes: number }
}) {
  const isNew = !product
  const [state, formAction, isPending] = useActionState(action, {})
  const upload = useProductFileUpload()

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      price: product?.price ?? "",
      status: product?.status ?? "draft",
    },
  })

  // Surface server-side validation (e.g. rules the client can't check) back
  // onto the fields.
  const { setError: setUploadError } = upload
  useEffect(() => {
    if (!state.fieldErrors) return
    for (const [field, messages] of Object.entries(state.fieldErrors)) {
      const message = messages?.[0]
      if (!message) continue
      // fileKey has no registered input to attach to — it is the upload field's,
      // which renders its own errors.
      if (field === "fileKey") setUploadError(message)
      else setError(field as keyof FormValues, { message })
    }
  }, [state.fieldErrors, setError, setUploadError])

  function submitWith(status: ProductStatus) {
    setValue("status", status)
    return handleSubmit((values) => {
      // A product is never created without its file, so the submit refuses
      // rather than producing something half-made that has to be repaired
      // later. An upload still in flight is a wait, not an error the user
      // caused, hence the different wording.
      if (isNew && !upload.fileKey) {
        upload.setError(
          upload.isUploading
            ? "Wait for the file to finish uploading"
            : "A product file is required",
        )
        return
      }

      const formData = new FormData()
      formData.set("name", values.name)
      if (values.description) formData.set("description", values.description)
      formData.set("price", String(values.price))
      formData.set("status", status)
      // Only on create: the file is chosen once and the update action has no
      // field for it.
      if (isNew && upload.fileKey) formData.set("fileKey", upload.fileKey)
      startTransition(() => formAction(formData))
    })
  }

  return (
    <form className="mx-auto flex max-w-[960px] flex-col gap-5 p-6" noValidate>
      <div>
        <Link
          href="/products"
          className="mb-2.5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-[15px]" /> Products
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-medium tracking-[-0.02em]">
            {isNew ? "New product" : product.name}
          </h1>
          {!isNew && (
            <Badge variant={product.status === "published" ? "default" : "secondary"}>
              {product.status === "draft" && (
                <span className="size-1.5 rounded-full bg-muted-foreground" />
              )}
              {product.status === "published" ? "Published" : "Draft"}
            </Badge>
          )}
          <div className="flex-1" />
          {!isNew && productId != null && (
            <DeleteProductButton
              productId={productId}
              productName={product.name}
              trigger={
                <Button variant="destructive">
                  <Trash2 /> Delete
                </Button>
              }
            />
          )}
          <Link href="/products" className={buttonVariants({ variant: "ghost" })}>
            Discard
          </Link>
          <Button
            type="submit"
            variant="outline"
            disabled={isPending || upload.isUploading}
            onClick={submitWith("draft")}
          >
            Save draft
          </Button>
          <Button
            type="submit"
            disabled={isPending || upload.isUploading}
            onClick={submitWith("published")}
          >
            Publish
          </Button>
        </div>
      </div>

      {state.formError && (
        <p className="text-sm text-destructive">{state.formError}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Product name</Label>
            <Input
              id="name"
              placeholder="e.g. Lightroom Preset Pack"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="price">Price ({APP_CURRENCY})</Label>
            <Input
              id="price"
              placeholder="29.00"
              aria-invalid={!!errors.price}
              {...register("price")}
            />
            {errors.price && (
              <p className="text-sm text-destructive">{errors.price.message}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what buyers get…"
              aria-invalid={!!errors.description}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* The digital product. Unlike images, it is chosen up front — a new
          product uploads one here, and an existing one only displays what it
          already has. Older products have no file, so there is nothing to show
          for them. */}
      {isNew ? (
        <ProductFileField upload={upload} />
      ) : (
        file && <ProductFileSummary name={file.name} sizeBytes={file.sizeBytes} />
      )}

      {/* Uploads attach to an existing row, so this only appears once the
          product has an id. New products get images after the first save. */}
      {productId != null && (
        <ProductImages productId={productId} images={images} />
      )}
    </form>
  )
}