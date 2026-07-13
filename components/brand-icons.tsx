import * as React from "react"

/**
 * Brand logos for social auth buttons. Phosphor doesn't ship company logos,
 * so these are the official multi-color marks as inline SVG.
 */

function GoogleIcon({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path
        fill="#4285F4"
        d="M21.68 12.18c0-.71-.06-1.4-.18-2.06H12v3.9h5.44a4.66 4.66 0 0 1-2.02 3.06v2.53h3.26c1.9-1.76 3-4.35 3-7.43Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.26-2.53c-.9.6-2.06.96-3.36.96-2.58 0-4.77-1.74-5.55-4.09H3.06v2.6A9.99 9.99 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.45 13.92a5.99 5.99 0 0 1 0-3.83V7.49H3.06a10 10 0 0 0 0 8.99l3.39-2.56Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.98c1.47 0 2.79.5 3.82 1.5l2.86-2.86C16.95 2.98 14.7 2 12 2A9.99 9.99 0 0 0 3.06 7.49l3.39 2.6C7.23 7.72 9.42 5.98 12 5.98Z"
      />
    </svg>
  )
}

function FacebookIcon({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path
        fill="#1877F2"
        d="M24 12c0-6.63-5.37-12-12-12S0 5.37 0 12c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08V12h3.05V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.93-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38C19.61 22.95 24 17.99 24 12Z"
      />
      <path
        fill="#fff"
        d="M16.67 15.47 17.2 12h-3.32V9.75c0-.94.46-1.87 1.95-1.87h1.51V4.93s-1.37-.24-2.68-.24c-2.74 0-4.53 1.66-4.53 4.67V12H7.08v3.47h3.05v8.38a12.1 12.1 0 0 0 3.75 0v-8.38h2.79Z"
      />
    </svg>
  )
}

export { GoogleIcon, FacebookIcon }
