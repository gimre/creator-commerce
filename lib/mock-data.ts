// Static placeholder data for the screens whose backend doesn't exist yet.
// Products and storefronts now read from the database; what's left here backs
// dashboard metrics, sales, purchases and downloads, none of which have tables.
// Each block goes away with the session that lands its feature.

export const kpis = [
  { label: "Revenue", value: "$4,280", sub: "last 30 days", delta: "+12%", up: true },
  { label: "Units sold", value: "142", sub: "last 30 days", delta: "+8%", up: true },
  { label: "Products", value: "14", sub: "3 drafts", delta: null, up: true },
  { label: "Conversion", value: "3.1%", sub: "storefront", delta: "-0.4%", up: false },
]

export const checklist = [
  { done: true, label: "Create your account" },
  { done: true, label: "Claim your handle", sub: "creatorcommerce.com/@gabi" },
  { done: true, label: "Publish your first product" },
  { done: false, label: "Connect Stripe to get paid" },
  { done: false, label: "Share your storefront link" },
]

export const topProducts = [
  { name: "Golden Hour Presets", rev: "$2,436", pct: 57 },
  { name: "Notion Freelance OS", rev: "$779", pct: 18 },
  { name: "Ambient Loops Vol. 2", rev: "$204", pct: 5 },
]

export const sales = [
  { order: "ord_8fA2c1", product: "Golden Hour Presets", buyer: "mara@example.com", date: "Jul 14, 2026", amount: "$29.00" },
  { order: "ord_7dK9b4", product: "Notion Freelance OS", buyer: "alex@example.com", date: "Jul 14, 2026", amount: "$19.00" },
  { order: "ord_6cJ3e8", product: "Golden Hour Presets", buyer: "iris@example.com", date: "Jul 13, 2026", amount: "$29.00" },
  { order: "ord_5bH1f2", product: "Ambient Loops Vol. 2", buyer: "tom@example.com", date: "Jul 12, 2026", amount: "$12.00" },
  { order: "ord_4aG7d5", product: "Golden Hour Presets", buyer: "nina@example.com", date: "Jul 11, 2026", amount: "$29.00" },
  { order: "ord_3zF4c9", product: "Notion Freelance OS", buyer: "leo@example.com", date: "Jul 10, 2026", amount: "$19.00" },
]

export const purchases = [
  { product: "Cinematic SFX Library", creator: "@soundroom", date: "Jun 28, 2026", amount: "$24.00" },
  { product: "Figma Portfolio Kit", creator: "@designdaily", date: "Jun 12, 2026", amount: "$18.00" },
  { product: "Street Photography Guide", creator: "@frankshoots", date: "May 30, 2026", amount: "$15.00" },
]

// Mirrors the digital asset kinds the download screen renders. Real products
// gain a type once asset uploads land; until then it only describes this file.
type DownloadType = "ZIP" | "PDF" | "Audio"

export const downloads: {
  product: string
  type: DownloadType
  size: string
  purchased: string
}[] = [
  { product: "Cinematic SFX Library", type: "ZIP", size: "312 MB", purchased: "Jun 28, 2026" },
  { product: "Figma Portfolio Kit", type: "ZIP", size: "9 MB", purchased: "Jun 12, 2026" },
  { product: "Street Photography Guide", type: "PDF", size: "14 MB", purchased: "May 30, 2026" },
]
