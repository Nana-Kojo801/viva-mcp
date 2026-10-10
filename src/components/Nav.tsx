"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { prefetchTools } from "@/lib/client/mcp";

const LINKS = [
  { href: "/", label: "quiz" },
  { href: "/notes", label: "notes" },
  { href: "/progress", label: "progress" },
];

export function Nav() {
  const path = usePathname();
  const active = Math.max(0, LINKS.findIndex((l) => l.href === path));

  // Once the app is idle, warm the data each tab shows first, so switching tabs never waits on the network.
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const run = () =>
      prefetchTools([
        ["list_decks"],
        ["get_study_nudge", { timezone }],
        ["get_progress", { timezone }],
      ]);
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const id = idle(run);
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id);
  }, []);
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-track">
        {LINKS.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            className="nav-link"
            aria-current={i === active ? "page" : undefined}
            transitionTypes={i === active ? undefined : [i > active ? "nav-forward" : "nav-back"]}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
