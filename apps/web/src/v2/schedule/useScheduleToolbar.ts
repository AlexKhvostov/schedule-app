import { useEffect, useRef, useState } from "react";

export function useScheduleToolbar(year: number) {
  const [limitsOpen, setLimitsOpen] = useState(false);

  const [kindOpen, setKindOpen] = useState(false);

  const [monthOpen, setMonthOpen] = useState(false);

  const [pickYear, setPickYear] = useState(year);

  const [focus, setFocus] = useState("");

  const [toolsOpen, setToolsOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);

  const limitsRef = useRef<HTMLDivElement>(null);

  const kindRef = useRef<HTMLDivElement>(null);

  const monthRef = useRef<HTMLDivElement>(null);

  const toolsRef = useRef<HTMLDivElement>(null);

  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!limitsOpen && !kindOpen && !monthOpen && !searchOpen) return;
    const close = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!limitsRef.current?.contains(node)) setLimitsOpen(false);
      if (!kindRef.current?.contains(node)) setKindOpen(false);
      if (!monthRef.current?.contains(node)) setMonthOpen(false);
      if (!searchRef.current?.contains(node)) setSearchOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLimitsOpen(false);
        setKindOpen(false);
        setMonthOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [limitsOpen, kindOpen, monthOpen, searchOpen]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return { limitsOpen, setLimitsOpen, kindOpen, setKindOpen, monthOpen, setMonthOpen, pickYear, setPickYear, focus, setFocus, toolsOpen, setToolsOpen, searchOpen, setSearchOpen, limitsRef, kindRef, monthRef, toolsRef, searchRef };
}
