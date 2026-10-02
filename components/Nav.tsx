const LINKS = [
  { label: "Work", href: "#selected-work" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

export default function Nav() {
  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-20 flex h-[var(--nav-h)] flex-wrap content-center items-center justify-between gap-x-8 gap-y-1 border-b border-b-[color-mix(in_srgb,var(--fg)_12%,transparent)] bg-bg/90 px-5 py-2 backdrop-blur-sm max-[700px]:px-3"
    >
      <div className="border border-transparent px-3 py-2 text-[13px] leading-[1.6] tracking-[0.04em] transition-colors hover:border-fg max-[700px]:px-2 max-[700px]:py-1 max-[700px]:text-xs">
        <p className="font-bold text-fg">Sahaj Singh</p>
        <p className="text-muted">Robotics Application Engineer · Jacobi</p>
      </div>
      <ul className="flex list-none gap-6 text-[13px] tracking-[0.04em] max-[700px]:gap-4 max-[700px]:pb-1 max-[700px]:pl-2 max-[700px]:text-xs">
        {LINKS.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              className="border-b border-b-transparent py-1 text-fg no-underline hover:border-b-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-4 focus-visible:outline-fg"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
