import type { ReactElement } from 'react'

import {
  PasswordResetEmail,
  passwordResetSubject,
} from '@/components/email/password-reset'
import { ReceiptEmail, receiptSubject } from '@/components/email/receipt'
import { SaleEmail, saleSubject } from '@/components/email/sale'
import { VerifyEmail, verifyEmailSubject } from '@/components/email/verify-email'
import { appUrl } from '@/lib/server/app-url'

/**
 * Every template the dev preview can render, and the data it renders with.
 *
 * Here rather than beside each template: fixtures exist to exercise a layout —
 * a name long enough to wrap, a zero price. Both the page and the route handler
 * for /dev/emails do import this module in the production bundle — they're not
 * excluded from it, and the TEMPLATES record below is built eagerly at module
 * scope, so it is evaluated in production too — but neither ever renders or
 * sends a fixture. The route stays free of per-template knowledge, so adding a
 * template is an entry in this record and nothing else.
 */
export type EmailFixture = {
  subject: string
  element: ReactElement
}

export const TEMPLATES: Record<string, EmailFixture> = {
  receipt: {
    subject: receiptSubject(),
    element: (
      <ReceiptEmail
        orderId="3f1c0b8e-9d2a-4f77-9a1e-5c6f2b7d8e90"
        appUrl={appUrl}
        items={[
          {
            productId: 1,
            productName: 'Lightroom Presets — Golden Hour',
            priceInCents: 12900,
          },
          {
            productId: 2,
            productName:
              'A deliberately long product name that has to wrap inside a narrow email column without pushing the price out of alignment',
            priceInCents: 4900,
          },
          { productId: 3, productName: 'Free sample pack', priceInCents: 0 },
        ]}
      />
    ),
  },
  sale: {
    subject: saleSubject(1),
    element: (
      <SaleEmail
        orderId="3f1c0b8e-9d2a-4f77-9a1e-5c6f2b7d8e90"
        appUrl={appUrl}
        items={[
          {
            productId: 1,
            productName: 'Lightroom Presets — Golden Hour',
            priceInCents: 12900,
          },
        ]}
      />
    ),
  },
  'sale-multi': {
    subject: saleSubject(3),
    element: (
      <SaleEmail
        orderId="7c2e1a4b-8f30-4d19-b6a2-0e5d3c9f1a72"
        appUrl={appUrl}
        items={[
          {
            productId: 1,
            productName: 'Lightroom Presets — Golden Hour',
            priceInCents: 12900,
          },
          {
            productId: 2,
            productName:
              'A deliberately long product name that has to wrap inside a narrow email column without pushing the price out of alignment',
            priceInCents: 4900,
          },
          { productId: 3, productName: 'Free sample pack', priceInCents: 0 },
        ]}
      />
    ),
  },
  'password-reset': {
    subject: passwordResetSubject(),
    element: (
      <PasswordResetEmail
        name="Gabi"
        url={`${appUrl}/api/auth/reset-password/dGhpcy1pcy1hLWZha2UtdG9rZW4?callbackURL=%2Freset-password`}
      />
    ),
  },
  'verify-email': {
    subject: verifyEmailSubject(),
    element: (
      <VerifyEmail
        name="Gabi"
        url={`${appUrl}/api/auth/verify-email?token=dGhpcy1pcy1hLWZha2UtdG9rZW4&callbackURL=%2Fverify-email`}
      />
    ),
  },
}
