import Link from "next/link";
import { Clock, Globe, MapPin, Phone, ShieldCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { cityLine, formatMiles, phoneHref, websiteHref, websiteLabel } from "../lib";
import type { ResourceCardDTO } from "../types";
import { FavoriteButton } from "./favorite-button";

/** One resource in the locator results or the saved list. */
export function ResourceCard({ resource, index = 0 }: { resource: ResourceCardDTO; index?: number }) {
  const phone = phoneHref(resource.contact);
  const website = websiteHref(resource.website);
  const place = cityLine(resource);
  const extras = [
    resource.scheduling && "Scheduling",
    resource.insuranceStatus && "Insurance info",
    resource.covidUpdates && "Covid-19 updates",
  ].filter(Boolean) as string[];

  return (
    <article
      className="group relative animate-rise rounded-2xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-lift sm:p-5"
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {resource.tags.length ? (
            <p className="mb-1.5 truncate text-xs font-semibold tracking-wide text-brand-magenta uppercase">
              {resource.tags.slice(0, 3).map((tag) => tag.name).join(" · ")}
            </p>
          ) : null}
          <h3 className="text-lg leading-snug font-semibold">
            <Link
              href={`/resources/${resource.id}`}
              className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {resource.title}
            </Link>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {resource.distanceMiles != null ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground tabular-nums">
                <MapPin aria-hidden className="size-3" />
                {formatMiles(resource.distanceMiles)}
              </span>
            ) : null}
            {place ? <span>{place}</span> : null}
            {resource.ratingCount ? (
              <span className="inline-flex items-center gap-1">
                <Star aria-hidden className="size-3.5 fill-brand-apricot text-brand-apricot" />
                <span className="font-medium text-foreground tabular-nums">{resource.ratingAverage.toFixed(1)}</span>
                <span className="sr-only">out of 5,</span>
                <span className="tabular-nums">({resource.ratingCount})</span>
              </span>
            ) : null}
          </div>
        </div>
        <FavoriteButton resourceId={resource.id} title={resource.title} favorited={resource.favorited} className="-mt-1 -mr-1" />
      </div>

      {resource.eligibility || resource.description ? (
        <p className="mt-3 line-clamp-2 text-[0.925rem] text-foreground/80">{resource.eligibility || resource.description}</p>
      ) : null}

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {resource.address ? (
          <Detail icon={MapPin} label="Address">
            {resource.address}
          </Detail>
        ) : null}
        {resource.hours ? (
          <Detail icon={Clock} label="Hours">
            <span className="line-clamp-2 whitespace-pre-line">{resource.hours}</span>
          </Detail>
        ) : null}
        {phone ? (
          <Detail icon={Phone} label="Phone">
            <a href={phone.href} className="relative z-10 font-medium text-primary hover:underline">
              {phone.label}
            </a>
          </Detail>
        ) : resource.contact ? (
          <Detail icon={Phone} label="Contact">
            <span className="line-clamp-1">{resource.contact}</span>
          </Detail>
        ) : null}
        {website ? (
          <Detail icon={Globe} label="Website">
            <a href={website} target="_blank" rel="noopener noreferrer" className="relative z-10 truncate font-medium text-primary hover:underline">
              {websiteLabel(website)}
            </a>
          </Detail>
        ) : null}
      </dl>

      {extras.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {extras.map((extra) => (
            <span key={extra} className={cn("inline-flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium text-muted-foreground")}>
              <ShieldCheck aria-hidden className="size-3" />
              {extra}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <dt className="mt-0.5 shrink-0">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 text-foreground/85">{children}</dd>
    </div>
  );
}
