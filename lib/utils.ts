import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// "Lightroom Presets — Golden Hour" -> "lightroom-presets-golden-hour".
// The slug is decorative: product pages are looked up by id, so slugs
// don't need to be unique.
export function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// "%40gabi" / "@gabi" -> "gabi". The [handle] URL segment carries a leading
// "@", the user.handle column stores it without one.
export function parseHandleSegment(segment: string) {
  return decodeURIComponent(segment).replace(/^@/, "")
}

// Cents + ISO currency code -> "$29.00". Prices are stored in cents.
export function formatPrice(priceInCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    priceInCents / 100,
  )
}

// "Gabi Ionescu" -> "GI". The user table has no initials column.
export function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (
    words
      .filter((_, i) => i === 0 || i === words.length - 1)
      .map((word) => word[0].toUpperCase())
      .join("")
  )
}
