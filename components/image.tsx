import type { Ref } from "react"
import NextImage, { type ImageProps as NextImageProps } from "next/image"

// The single seam every image in the app renders through. `next/image` is the
// implementation for now — swapping it, or adding an app-wide default (a
// loader, a blur placeholder), is an edit to this file rather than a sweep.
//
// Props that Next 16 deprecated are dropped from the surface so callers can't
// reach for them: `priority` (superseded by `preload`), `onLoadingComplete`
// (superseded by `onLoad`), and the `next/legacy/image` leftovers.
type BaseProps = Omit<
  NextImageProps,
  | "priority"
  | "onLoadingComplete"
  | "layout"
  | "objectFit"
  | "objectPosition"
  | "lazyBoundary"
  | "lazyRoot"
  // Owned by the two unions below.
  | "fill"
  | "width"
  | "height"
  | "sizes"
  // Derived from `preload` below — never set by hand, or the two disagree.
  | "fetchPriority"
> & {
  ref?: Ref<HTMLImageElement | null>
}

// Every image declares its box up front, one way or the other. Without this the
// two cheap mistakes are silent: a `fill` image with no `sizes` makes the
// browser assume 100vw and pull the largest srcset candidate, and an intrinsic
// image with no dimensions reserves no space, so the page shifts when it lands.
type SizingProps =
  | {
      // Stretches to a positioned parent, which owns the aspect ratio.
      fill: true
      // How wide the parent actually renders, per breakpoint.
      sizes: string
      width?: never
      height?: never
    }
  | {
      fill?: false
      // Intrinsic pixel size. Not the rendered size — CSS still decides that —
      // but the ratio the browser reserves space with.
      width: number
      height: number
      sizes?: string
    }

type LoadingProps = {
  // Set on the one image that is the page's LCP candidate. It preloads the url
  // from <head>, loads eagerly rather than lazily, and — the part `preload`
  // alone does not do — marks the request `fetchpriority="high"` so it jumps
  // the queue ahead of the other images the browser discovers at the same time.
  //
  // Only ever one per page: more than one high-priority image and they compete,
  // which is the problem it was meant to solve.
  //
  // For an image that is off-screen but likely to be revealed by an
  // interaction — the next carousel slide — reach for `loading="eager"`
  // instead. It fetches up front without claiming priority over what the user
  // can already see. (Passing it alongside `loading="lazy"` throws.)
  preload?: boolean
}

export type ImageProps = BaseProps & SizingProps & LoadingProps

export function Image({ preload, ...props }: ImageProps) {
  return (
    <NextImage
      {...props}
      preload={preload}
      fetchPriority={preload ? "high" : undefined}
    />
  )
}
