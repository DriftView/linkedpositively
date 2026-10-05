import { BookOpen, CircleHelp, FileText, HandHeart, Info, LifeBuoy, MessageSquareHeart, Rocket, ScrollText, ShieldCheck, Users } from "lucide-react";

const ICONS: Record<string, typeof Info> = {
  about: Info,
  "about-us": Users,
  "getting-started": Rocket,
  faq: CircleHelp,
  help: HandHeart,
  "community-guidelines": ShieldCheck,
  "terms-disclosure": ScrollText,
  "feedback-contact": MessageSquareHeart,
  support: LifeBuoy,
  glossary: BookOpen,
};

const TINTS = [
  "bg-brand-sky/15 text-brand-sky",
  "bg-brand-magenta/10 text-brand-magenta",
  "bg-brand-apricot/20 text-primary",
  "bg-secondary text-primary",
  "bg-brand-pink/20 text-brand-magenta",
];

/** Icon tile for an information page. */
export function PageIcon({ slug, index = 0, className = "size-11" }: { slug: string; index?: number; className?: string }) {
  const Icon = ICONS[slug] ?? FileText;
  return (
    <span className={`grid shrink-0 place-items-center rounded-2xl ${TINTS[index % TINTS.length]} ${className}`}>
      <Icon aria-hidden className="size-5" />
    </span>
  );
}
