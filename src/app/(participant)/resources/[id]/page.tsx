import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  ExternalLink,
  Globe,
  HeartPulse,
  Info,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommentSection } from "@/features/community/components/comment-section";
import { FavoriteButton } from "@/features/resources/components/favorite-button";
import { ReportResource } from "@/features/resources/components/report-resource";
import { StarRating } from "@/features/resources/components/star-rating";
import { TrackVisit } from "@/features/resources/components/track-visit";
import {
  cityLine,
  directionsHref,
  emailHref,
  mapsHref,
  phoneHref,
  websiteHref,
  websiteLabel,
} from "@/features/resources/lib";
import { getResource } from "@/features/resources/queries";
import { can, requirePermission } from "@/server/auth/session";

export async function generateMetadata(props: PageProps<"/resources/[id]">) {
  const viewer = await requirePermission("resources.view");
  const { id } = await props.params;
  const resource = await getResource(viewer.id, id);
  return { title: resource?.title ?? "Resource" };
}

export default async function ResourcePage(props: PageProps<"/resources/[id]">) {
  const viewer = await requirePermission("resources.view");
  const { id } = await props.params;
  const resource = await getResource(viewer.id, id, { staff: can(viewer, "resources.manage") });
  if (!resource) notFound();

  const phone = phoneHref(resource.contact);
  const email = emailHref(resource.contact);
  const website = websiteHref(resource.website);
  const place = cityLine(resource);
  const hasAddress = Boolean(resource.address || resource.city || resource.zip);

  const sections = [
    { icon: UserCheck, title: "Who it's for", body: resource.eligibility },
    { icon: CalendarClock, title: "Scheduling", body: resource.scheduling },
    { icon: ShieldCheck, title: "Insurance status", body: resource.insuranceStatus },
    { icon: HeartPulse, title: "Covid-19 updates", body: resource.covidUpdates },
    { icon: Sparkles, title: "Services", body: resource.services },
  ].filter((section) => section.body);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/resources"
        className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Resources
      </Link>

      {resource.status !== "published" ? (
        <p className="mb-4 flex items-center gap-2 rounded-2xl bg-warning/20 px-4 py-3 text-sm">
          <Info aria-hidden className="size-4 shrink-0" />
          Only staff can see this page: the resource is {resource.status === "suggested" ? "a suggestion waiting for review" : "unpublished"}.
          <Link href={`/admin/content/resources/${resource.id}`} className="ml-auto font-semibold text-primary hover:underline">
            Edit
          </Link>
        </p>
      ) : null}

      <article className="animate-rise overflow-hidden rounded-3xl border bg-card shadow-soft">
        <header className="relative bg-gradient-to-br from-secondary via-card to-card p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {resource.tags.length ? (
                <ul className="mb-3 flex flex-wrap gap-1.5">
                  {resource.tags.map((tag) => (
                    <li key={tag.id}>
                      <Link
                        href={`/resources?tags=${tag.slug}`}
                        className="inline-flex h-7 items-center rounded-full bg-card/80 px-2.5 text-xs font-semibold text-brand-magenta ring-1 ring-brand-magenta/20 transition-colors hover:bg-brand-magenta/10"
                      >
                        {tag.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <h1 className="text-2xl leading-tight font-semibold sm:text-3xl">{resource.title}</h1>
              {place ? <p className="mt-1.5 text-muted-foreground">{place}</p> : null}
            </div>
          </div>
          {resource.description ? <p className="mt-4 text-[0.975rem] leading-7 text-foreground/85">{resource.description}</p> : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <FavoriteButton resourceId={resource.id} title={resource.title} favorited={resource.favorited} variant="pill" />
            {phone ? (
              <Button asChild className="h-11 rounded-full px-4 font-semibold">
                <a href={phone.href}>
                  <Phone aria-hidden />
                  Call
                </a>
              </Button>
            ) : null}
            {hasAddress ? (
              <Button asChild variant="outline" className="h-11 rounded-full bg-card px-4 font-semibold">
                <a href={directionsHref(resource)} target="_blank" rel="noopener noreferrer">
                  <Navigation aria-hidden />
                  Directions
                </a>
              </Button>
            ) : null}
            {website ? (
              <Button asChild variant="outline" className="h-11 rounded-full bg-card px-4 font-semibold">
                <a href={website} target="_blank" rel="noopener noreferrer">
                  <Globe aria-hidden />
                  Website
                </a>
              </Button>
            ) : null}
          </div>
        </header>

        <dl className="grid gap-px bg-border sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2">
          {hasAddress ? (
            <Fact icon={MapPin} label="Address">
              <p>{resource.address}</p>
              {place ? <p>{place}</p> : null}
              <a
                href={mapsHref(resource)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Open in maps
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            </Fact>
          ) : null}
          {resource.hours ? (
            <Fact icon={Clock} label="Hours">
              <p className="whitespace-pre-line">{resource.hours}</p>
            </Fact>
          ) : null}
          {resource.contact ? (
            <Fact icon={Phone} label="Contact">
              <p className="break-words">{resource.contact}</p>
              {phone || email ? (
                <p className="mt-1 flex flex-wrap gap-x-3 text-sm font-semibold">
                  {phone ? (
                    <a href={phone.href} className="text-primary hover:underline">
                      Call {phone.label}
                    </a>
                  ) : null}
                  {email ? (
                    <a href={email.href} className="text-primary hover:underline">
                      Email
                    </a>
                  ) : null}
                </p>
              ) : null}
            </Fact>
          ) : null}
          {website ? (
            <Fact icon={Globe} label="Website">
              <a href={website} target="_blank" rel="noopener noreferrer" className="font-semibold break-all text-primary hover:underline">
                {websiteLabel(website)}
              </a>
            </Fact>
          ) : null}
        </dl>

        {sections.length ? (
          <div className="divide-y border-t">
            {sections.map((section) => (
              <section key={section.title} className="flex gap-3 p-5 sm:px-7">
                <section.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h2 className="font-sans text-sm font-semibold tracking-wide text-muted-foreground uppercase">{section.title}</h2>
                  <p className="mt-1 whitespace-pre-line text-foreground/90">{section.body}</p>
                </div>
              </section>
            ))}
          </div>
        ) : null}

        <footer className="border-t bg-muted/30 p-5 sm:px-7">
          <h2 className="text-base font-semibold">Been here? Rate it for others</h2>
          <div className="mt-2">
            <StarRating resourceId={resource.id} mine={resource.myRating} average={resource.ratingAverage} count={resource.ratingCount} />
          </div>
        </footer>
      </article>

      <div className="mt-3 px-1">
        <ReportResource resourceId={resource.id} reported={resource.myReport} />
      </div>

      <div className="mt-8">
        <CommentSection target={{ type: "resource", id: resource.id }} viewer={viewer} title="Tips from members" />
      </div>

      <TrackVisit resourceId={resource.id} />
    </div>
  );
}

function Fact({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-card p-5 sm:px-7">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="font-sans text-sm font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
        <dd className="mt-1 text-foreground/90">{children}</dd>
      </div>
    </div>
  );
}
