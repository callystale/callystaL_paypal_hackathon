"use client";

import { useEffect, useState } from "react";

const pages = [
  { id: "calendar", label: "Overview", number: "00" },
  { id: "income", label: "My budget", number: "01" },
  { id: "purchases", label: "Spending", number: "02" },
  { id: "categories", label: "Categories", number: "03" },
  { id: "wishlist", label: "Wishlist", number: "04" },
  { id: "milestones", label: "Milestones", number: "05" },
];

export function NotebookNav() {
  const [active, setActive] = useState("calendar");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const positions = pages.map((page) => ({ id: page.id, top: document.getElementById(page.id)?.getBoundingClientRect().top ?? Infinity }));
        const above = positions.filter((page) => page.top <= 150);
        if (above.length) setActive(above[above.length - 1].id);
        else setActive("calendar");
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => { window.removeEventListener("scroll", update); cancelAnimationFrame(frame); };
  }, []);
  return (
    <nav aria-label="Dashboard sections" className="notebook-nav">
      {pages.map((page) => (
        <a key={page.id} href={`#${page.id}`} className="notebook-tab" aria-current={active === page.id ? "location" : undefined} onClick={() => setActive(page.id)}>
          <span className="text-[10px] font-normal opacity-70" aria-hidden="true">{page.number}</span>
          {page.label}
        </a>
      ))}
    </nav>
  );
}
