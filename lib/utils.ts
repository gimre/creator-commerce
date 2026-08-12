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

// 5_242_880 -> "5 MB". Binary units, because that is what the file-size limit is
// expressed in and a file that "just fits" must not render as 105 MB against a
// 100MB cap. One decimal place below 10 so a 1.4 MB file doesn't read as 1 MB.
export function formatFileSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB"]
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  const decimals = unit === 0 || size >= 10 ? 0 : 1
  return `${size.toFixed(decimals)} ${units[unit]}`
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
