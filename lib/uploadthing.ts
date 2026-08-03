import {
  generateReactHelpers,
  generateUploadButton,
  generateUploadDropzone,
} from '@uploadthing/react'

import type { UploadRouter } from '@/lib/server/uploadthing'

// `import type` is erased at compile time, so the server-only file router never
// reaches the client bundle — only its type does.
export const { useUploadThing, uploadFiles } =
  generateReactHelpers<UploadRouter>()

export const UploadButton = generateUploadButton<UploadRouter>()
export const UploadDropzone = generateUploadDropzone<UploadRouter>()
