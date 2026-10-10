"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MicIcon, PageIcon, TallyIcon } from "./Icons";

const LINKS = [
  { href: "/", label: "Quiz", Icon: MicIcon },
  { href: "/notes", label: "Notes", Icon: PageIcon },
  { href: "/progress", label: "Progress", Icon: TallyIcon },
];

export function Nav() {
  const path = usePathname();
  const active = Math.max(0, LINKS.findIndex((l) => l.href === path));
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
