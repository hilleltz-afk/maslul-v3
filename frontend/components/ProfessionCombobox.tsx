"use client";

import { useEffect, useRef, useState } from "react";
import { PROFESSIONS } from "@/lib/professions";

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function ProfessionCombobox({ value, onChange, placeholder = "בחר מקצוע...", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  // sync display when value changes externally
  useEffect(() => { setQuery(value); }, [value]);

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query
    ? PROFESSIONS.filter(p => p.includes(query))
    : PROFESSIONS;

  function select(p: string) {
    onChange(p);
    setQuery(p);
    setOpen(false);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
    if (!e.target.value) onChange("");
  }

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "6px 10px",
          border: "1px solid #ccc",
          borderRadius: 6,
          fontSize: 14,
          direction: "rtl",
          background: disabled ? "#f5f5f5" : "#fff",
          boxSizing: "border-box",
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          left: 0,
          background: "#fff",
          border: "1px solid #ccc",
          borderRadius: 6,
          zIndex: 999,
          maxHeight: 220,
          overflowY: "auto",
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        }}>
          {filtered.map(p => (
            <div
              key={p}
              onMouseDown={() => select(p)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 14,
                direction: "rtl",
                background: p === value ? "#e8f0fe" : "transparent",
                fontWeight: p === value ? 600 : 400,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
              onMouseLeave={e => (e.currentTarget.style.background = p === value ? "#e8f0fe" : "transparent")}
            >
              {p}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
