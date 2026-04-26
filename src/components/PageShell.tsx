import Link from "next/link";
import type { ReactNode } from "react";

export function SiteHeader() {
  return (
    <nav className="flex items-center justify-between">
      <Link
        href="/"
        className="text-2xl font-bold tracking-tight text-primary"
      >
        MirrorMe
      </Link>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-outline-variant pt-6 text-sm text-on-surface-variant sm:flex-row">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-on-surface">MirrorMe</span>
        <span className="opacity-50">•</span>
        <span>Auto-deletes 24 hours after upload</span>
      </div>
      <a
        href="https://github.com/agustin-vaca/image-transformation"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
      >
        GitHub
      </a>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <div className="mx-auto flex max-w-[720px] flex-col gap-12 px-8 py-8 sm:py-12">
        <SiteHeader />
        {children}
        <SiteFooter />
      </div>
    </main>
  );
}
