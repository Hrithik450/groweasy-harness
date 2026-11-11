import { useCallback, useEffect, useRef, useState } from "react";

import { focusRing, monoFont } from "./styles";

export type SectionNavItem = {
  id: string;
  number: string;
  label: string;
  status: string;
  statusClass: string;
};

/**
 * The reading line is measured from the top of the scroll container.
 * It sits just below the sticky nav's top padding, so a section becomes
 * "current" as its heading reaches the reader's eye line.
 */
const ACTIVE_LINE_PX = 120;

export function SectionNavClient({ items }: { items: SectionNavItem[] }) {
  const navRef = useRef<HTMLElement>(null);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  /**
   * Only the profile <main> should scroll. A plain fragment jump also drags
   * the document root along (it is taller than the viewport here), which
   * leaves <main> offset and the sticky nav floating away from the content.
   */
  const scrollToSection = useCallback((id: string) => {
    const root = navRef.current?.closest("main") as HTMLElement | null;
    const target = document.getElementById(id);
    if (!root || !target) {
      return;
    }

    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const top =
      target.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop -
      margin;

    root.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      return;
    }

    // Plain anchors keep the URL hash shareable; this effect only mirrors the
    // hash and the scroll position into the nav's active state.
    const targets = items
      .map((item) => document.getElementById(item.id))
      .filter((target): target is HTMLElement => target !== null);

    if (targets.length === 0) {
      return;
    }

    const scrollRoot = nav.closest("main");
    let observer: IntersectionObserver | undefined;
    let activeLine = ACTIVE_LINE_PX;

    const syncHash = (scroll = false) => {
      const hash = window.location.hash.slice(1);
      if (items.some((item) => item.id === hash)) {
        setActiveId(hash);
        if (scroll) {
          scrollToSection(hash);
        }
      }
    };

    const onHashChange = () => syncHash(true);

    const resolveActive = () => {
      const rootTop = scrollRoot?.getBoundingClientRect().top ?? 0;
      const line = rootTop + activeLine;
      let next = targets[0].id;

      for (const target of targets) {
        if (target.getBoundingClientRect().top <= line) {
          next = target.id;
        }
      }

      // The last section can be shorter than the reading line; when the
      // reader has hit the bottom of the container, it is the current one.
      if (
        scrollRoot &&
        scrollRoot.scrollHeight > scrollRoot.clientHeight + 2 &&
        scrollRoot.scrollTop + scrollRoot.clientHeight >=
          scrollRoot.scrollHeight - 2
      ) {
        next = targets[targets.length - 1].id;
      }

      setActiveId(next);
    };

    // A two-pixel band at the reading line means every callback marks an
    // actual section boundary crossing, not an arbitrary scroll sample.
    const observe = () => {
      observer?.disconnect();

      const rootHeight = scrollRoot?.clientHeight ?? window.innerHeight;
      activeLine = Math.min(ACTIVE_LINE_PX, Math.max(1, rootHeight - 1));
      const below = Math.max(0, rootHeight - activeLine - 2);

      observer = new IntersectionObserver(
        () => {
          resolveActive();
        },
        {
          root: scrollRoot,
          rootMargin: `-${activeLine}px 0px -${below}px 0px`,
          threshold: 0,
        },
      );

      for (const target of targets) {
        observer.observe(target);
      }

      resolveActive();
    };

    // A deep link such as /profile#p6 is scrolled by the browser on load,
    // which also moves the document root. Undo that and scroll the container.
    window.scrollTo(0, 0);
    syncHash();
    if (window.location.hash.length > 1) {
      requestAnimationFrame(() => {
        scrollToSection(window.location.hash.slice(1));
      });
    }
    observe();

    // IntersectionObserver only reports threshold crossings, so a scroll that
    // ends without one (e.g. landing on the last, short section at the bottom)
    // would leave the old item highlighted. Track the scroll itself as well.
    let frame = 0;
    const onScroll = () => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        resolveActive();
      });
    };

    // Deep links are scrolled by the browser (or by router scroll restoration)
    // after hydration. This page scrolls inside <main> only, so keep the root
    // pinned; otherwise <main> ends up offset and the sticky nav drifts away.
    const pinRoot = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    scrollRoot?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", pinRoot, { passive: true });
    window.addEventListener("resize", observe);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      scrollRoot?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", pinRoot);
      window.removeEventListener("resize", observe);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, [items, scrollToSection]);

  return (
    <nav
      aria-label="Profile sections"
      className={`sticky top-0 z-[1] flex max-w-[260px] flex-[0_1_240px] flex-col gap-0.5 self-start bg-[#F3EFE4] py-8 pr-6 ${monoFont} text-[13px] max-[900px]:static max-[900px]:grid max-[900px]:w-full max-[900px]:max-w-none max-[900px]:flex-none max-[900px]:grid-cols-2 max-[900px]:gap-x-6 max-[900px]:gap-y-0 max-[900px]:border-b-2 max-[900px]:border-[#0E0E0E] max-[900px]:px-0 max-[900px]:py-5 max-[520px]:grid-cols-1`}
      ref={navRef}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <a
            aria-current={isActive ? "location" : undefined}
            className={`group flex min-h-11 items-center justify-between gap-3 border-b border-b-[#E9E4D6] border-l-[3px] py-2.5 pl-3 pr-0 no-underline motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${focusRing} ${
              isActive
                ? "border-l-[#FF4D1C] bg-[#E9E4D6]/40"
                : "border-l-transparent hover:bg-[#E9E4D6]/25 hover:text-[#FF4D1C]"
            }`}
            href={`#${item.id}`}
            key={item.id}
            onClick={(event) => {
              event.preventDefault();
              setActiveId(item.id);
              window.history.pushState(null, "", `#${item.id}`);
              scrollToSection(item.id);
            }}
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <b
                className={`font-bold motion-safe:transition-colors motion-safe:duration-150 ${
                  isActive
                    ? "text-[#FF4D1C]"
                    : "text-[#6B6657] group-hover:text-[#FF4D1C]"
                }`}
              >
                {item.number}
              </b>{" "}
              {item.label}
            </span>
            <span className={`shrink-0 whitespace-nowrap ${item.statusClass}`}>
              {item.status}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
