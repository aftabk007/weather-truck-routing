import { useEffect, useRef, useState } from "react";
import { api, type Place } from "../api";

type Props = {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  placeholder?: string;
};

/** Text box with place suggestions (debounced, cancels stale requests). */
export function PlaceInput({ label, value, onChange, placeholder }: Props) {
  const [text, setText] = useState(value?.label ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef(false);

  // Show the chosen place's name, but never wipe what the user is typing:
  // typing clears the chosen place (value -> null) on purpose.
  useEffect(() => {
    if (!typed.current) setText(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    if (!typed.current || text.trim().length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api
        .geocode(text, ctrl.signal)
        .then((r) => {
          setResults(r);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text]);

  const choose = (p: Place) => {
    typed.current = false;
    onChange(p);
    setOpen(false);
  };

  return (
    <label className="field place">
      <span>{label}</span>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          typed.current = true;
          setText(e.target.value);
          if (value) onChange(null);
        }}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[active]);
          } else return;
          e.preventDefault();
        }}
        aria-autocomplete="list"
        aria-invalid={!value && text.length > 0}
      />
      {open && results.length > 0 && (
        <ul className="suggestions" role="listbox">
          {results.map((r, i) => (
            <li
              key={`${r.lat},${r.lon}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={() => choose(r)}
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
