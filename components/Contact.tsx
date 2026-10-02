export default function Contact() {
  return (
    <section id="contact">
      <header className="mb-4 max-w-[40rem] leading-normal">
        <p className="mb-2 text-[0.8rem] uppercase tracking-[0.08em] text-muted">05 / contact</p>
        <p>The best place to find what I&apos;m working on, and to say hello.</p>
      </header>
      <ul className="flex list-none gap-6 text-[0.85rem]">
        <li>
          <a href="https://github.com/Bigguysahaj" target="_blank" rel="noreferrer" className="text-fg underline underline-offset-4">
            ↗ github
          </a>
        </li>
        <li>
          <a href="https://x.com/bigguysahaj" target="_blank" rel="noreferrer" className="text-fg underline underline-offset-4">
            ↗ x
          </a>
        </li>
      </ul>
    </section>
  );
}
