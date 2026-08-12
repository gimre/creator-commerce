"use client"

import { useRef, useState } from "react"
import { Check, FileUp, Loader2, Paperclip } from "lucide-react"

import { useUploadThing } from "@/lib/client/uploadthing"
import {
  MAX_PRODUCT_FILE_BYTES,
  MAX_PRODUCT_FILE_LABEL,
} from "@/lib/schemas/product"
import { cn, formatFileSize } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type ProductFileUpload = ReturnType<typeof useProductFileUpload>

/**
 * The create form's file upload, as state the form can gate its submit on.
 *
 * A hook rather than state inside ProductFileField because the form needs two
 * things out of it: the key to submit, and whether an upload is still in flight.
 * The field below is then only a view of what this returns.
 *
 * The upload starts the moment a file is picked, so it runs while the rest of
 * the form is being filled in rather than after the user commits.
 */
export function useProductFileUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const { startUpload, isUploading } = useUploadThing("productFile", {
    onUploadProgress: setProgress,
    onClientUploadComplete: (res) => {
      // This fires only after the route's completion callback has finished, so
      // the key is already recorded — and therefore claimable — by the time it
      // reaches the form. Losing that ordering would make the submit a race.
      const key = res[0]?.serverData.key
      if (!key) {
        setError("The upload did not complete. Please try again.")
        return
      }
      setFileKey(key)
    },
    onUploadError: (e) => {
      setError(e.message)
      // Clearing the file returns the field to its empty state: the pick failed,
      // so showing it as chosen would misdescribe what the form will submit.
      setFile(null)
    },
  })

  function select(picked: File | null) {
    if (!picked) return

    // The first of the limit's three checks. This one is only for the user's
    // benefit — it fails a 2GB pick instantly instead of after a round trip.
    // The route enforces the limit whatever happens here.
    if (picked.size > MAX_PRODUCT_FILE_BYTES) {
      setFile(null)
      setFileKey(null)
      setError(`File must be at most ${MAX_PRODUCT_FILE_LABEL}`)
      return
    }

    setError(null)
    setProgress(0)
    // Dropped, so a second pick can't submit the first file's key.
    setFileKey(null)
    setFile(picked)
    void startUpload([picked])
  }

  return { file, fileKey, error, progress, isUploading, select, setError }
}

export function ProductFileField({ upload }: { upload: ProductFileUpload }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { file, error, progress, isUploading, select } = upload

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product file</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            if (isUploading) return
            select(e.dataTransfer.files[0] ?? null)
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center transition-colors",
            isDragging && "border-ring/50 bg-muted/40",
            error && "border-destructive/50",
          )}
        >
          {file ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <Check className="size-4 text-muted-foreground" />
                )}
                <span className="break-all">{file.name}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(file.size)}
                {isUploading && ` · ${progress}%`}
              </p>
              {isUploading && (
                <div
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuenow={progress}
                  className="h-1 w-full max-w-64 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <FileUp className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">
                Drop your file here, or choose one
              </p>
              <p className="text-sm text-muted-foreground">
                Any file type, up to {MAX_PRODUCT_FILE_LABEL}
              </p>
            </>
          )}

          <Button
            type="button"
            variant={file ? "ghost" : "default"}
            size="sm"
            className="mt-1"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {file ? "Choose a different file" : "Choose file"}
          </Button>

          {/* Deliberately unnamed: the file itself is never submitted to the
              action. What the form sends is the key this upload returns. */}
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              select(e.target.files?.[0] ?? null)
              // Reset, so re-picking the same file after an error still fires a
              // change event.
              e.target.value = ""
            }}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

/**
 * The file on an existing product, shown but not editable.
 *
 * A product's file is chosen once, when the product is created. There is no
 * replacing it and no removing it — buyers hold a claim on what they paid for,
 * so the only way to withdraw a file is to delete the product it belongs to.
 */
export function ProductFileSummary({
  name,
  sizeBytes,
}: {
  name: string
  sizeBytes: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Product file</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-border p-3">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {name}
          </span>
          <span className="text-sm text-muted-foreground">
            {formatFileSize(sizeBytes)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          The file is set when the product is created and can&apos;t be replaced.
        </p>
      </CardContent>
    </Card>
  )
}
