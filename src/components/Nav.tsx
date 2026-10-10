"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { prefetchTools } from "@/lib/client/mcp";
import { MicIcon, PageIcon, TallyIcon } from "./Icons";

const LINKS = [
  { href: "/", label: "Quiz", Icon: MicIcon },
  { href: "/notes", label: "Notes", Icon: PageIcon },
  { href: "/progress", label: "Progress", Icon: TallyIcon },
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
    <nav className="nav" aria-label="Main" style={{ ["--active" as string]: active }}>
      <div className="nav-track">
        <span className="nav-indicator" aria-hidden="true" />
        {LINKS.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            className="nav-link"
            aria-current={i === active ? "page" : undefined}
            transitionTypes={i === active ? undefined : [i > active ? "nav-forward" : "nav-back"]}
          >
            <l.Icon className="nav-icon" />
            <span>{l.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
