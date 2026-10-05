import { LogoMark } from "@/components/brand/logo";

/**
 * Signed-out screens: a calm brand panel beside the form on large screens,
 * the form alone on phones.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.26_0.09_330)] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 15%, oklch(0.47 0.18 359 / 0.55), transparent 70%), radial-gradient(55% 45% at 85% 80%, oklch(0.42 0.13 316 / 0.9), transparent 70%), radial-gradient(40% 30% at 70% 20%, oklch(0.8 0.12 225 / 0.18), transparent 70%)",
          }}
        />
        <div aria-hidden className="absolute -right-24 -bottom-24 size-[28rem] opacity-[0.07]">
          <LogoMark className="size-full" ring="#fff" figure="#fff" title="" />
        </div>
        <div className="relative flex items-center gap-3">
          <LogoMark className="size-10" ring="var(--brand-pink)" figure="#fff" />
          <span className="font-heading text-lg font-semibold tracking-tight">Link Positively</span>
        </div>
        <div className="relative max-w-md">
          <p className="font-heading text-4xl leading-[1.1] font-semibold tracking-tight text-balance">
            A private space to check in, learn and connect.
          </p>
          <p className="mt-5 text-base leading-relaxed text-white/75">
            Daily tips, a supportive community, and your peer navigator, all in one place.
          </p>
        </div>
        <p className="relative text-sm text-white/60">
          This is a research study. What you share here stays private to the study team.
        </p>
      </aside>

      <main className="flex flex-col items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <LogoMark className="size-10 text-primary" />
            <span className="font-heading text-lg font-semibold tracking-tight">Link Positively</span>
          </div>
          {children}
        </div>
        <p className="mt-12 max-w-sm text-center text-xs leading-relaxed text-muted-foreground lg:hidden">
          This is a research study. What you share here stays private to the study team.
        </p>
      </main>
    </div>
  );
}
