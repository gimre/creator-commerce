import { SparkleIcon } from "@phosphor-icons/react/ssr"

const features = [
  "Magazin, plăți și livrare digitală — fără cod",
  "Payout-uri automate, securizate",
  "Abonamente și produse digitale într-un singur loc",
]

export function LoginBrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between border-r border-[var(--jp-line)] bg-[var(--jp-panel)] p-12 lg:flex">
      {/* Wordmark */}
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <SparkleIcon weight="fill" className="size-4" />
        </span>
        <span className="font-heading text-base font-semibold tracking-tight">
          Creator Commerce
        </span>
      </div>

      {/* Headline */}
      <div className="flex max-w-md flex-col gap-6">
        <h2 className="font-heading text-3xl leading-[1.15] font-semibold tracking-tight text-balance">
          Transformă-ți comunitatea într-un business.
        </h2>

        <ul className="flex flex-col gap-3">
          {features.map((text) => (
            <li
              key={text}
              className="flex items-start gap-3 text-sm text-muted-foreground"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--jp-sage)]" />
              {text}
            </li>
          ))}
        </ul>
      </div>

      {/* Minimal testimonial */}
      <figure className="max-w-md border-l-2 border-[var(--jp-sage)] pl-4">
        <blockquote className="text-sm leading-relaxed text-foreground/80">
          „Am trecut de la 0 la primii 1.000 de clienți în două luni. Platforma
          se ocupă de partea plictisitoare, eu creez."
        </blockquote>
        <figcaption className="mt-3 text-xs text-muted-foreground">
          Ana-Maria R. · Creatoare de conținut
        </figcaption>
      </figure>
    </div>
  )
}
