import 'client-only';

import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

// The schema is spelled out instead of using inferAdditionalFields<typeof auth>()
// because lib/server/auth.ts is server-only and must not be referenced here.
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: { handle: { type: 'string' } },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
