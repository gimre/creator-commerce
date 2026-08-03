import { createRouteHandler } from 'uploadthing/next';

import { uploadRouter } from '@/lib/server/uploadthing';

export const { GET, POST } = createRouteHandler({ router: uploadRouter });
