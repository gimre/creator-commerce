// The purchase lifecycle, kept out of the server DB schema on purpose.
//
// lib/schemas/product.ts has this the wrong way round — it imports the runtime
// `productStatus` value *from* lib/server/db/schemas/product.ts, which drags
// drizzle-orm/pg-core into the client bundle (see TODO.md, tech debt). Declaring
// it here and having the DB schema import it is the direction that file should
// eventually be fixed to.
//
// Today's checkout writes 'paid' directly. Stripe will write 'pending' and move
// the row on webhook confirmation, which is why the state exists before anything
// can produce it.
export const purchaseStatus = ['pending', 'paid', 'refunded'] as const
export type PurchaseStatus = (typeof purchaseStatus)[number]
