# TODO

## Tech debt

- **Extract `productStatus` enum out of the server DB schema.**
  `lib/schemas/product.ts` imports the runtime value `productStatus` from
  `lib/server/db/schemas/product.ts`. Since `createProductSchema` is imported by
  the client `ProductForm`, this pulls `drizzle-orm/pg-core` into the client
  bundle. Move `productStatus`/`ProductStatus` into a client-safe shared module
  (e.g. under `lib/schemas/`) and have the DB schema import it from there.
