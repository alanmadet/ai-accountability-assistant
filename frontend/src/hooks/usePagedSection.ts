import { useMemo, useRef, useState } from "react";
import { useSwipe } from "./useSwipe";

export function usePagedSection<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const sectionRef = useRef<HTMLElement>(null);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageSafe = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((pageSafe - 1) * pageSize, pageSafe * pageSize),
    [items, pageSafe, pageSize]
  );

  function goToPage(next: number) {
    const clamped = Math.min(Math.max(1, next), totalPages);
    setPage(clamped);
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const swipeHandlers = useSwipe(
    () => goToPage(pageSafe + 1),
    () => goToPage(pageSafe - 1)
  );

  return { page: pageSafe, totalPages, pageItems, goToPage, sectionRef, swipeHandlers };
}
