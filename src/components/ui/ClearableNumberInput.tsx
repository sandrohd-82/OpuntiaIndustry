"use client";

import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: number | "";
  onValueChange: (value: number | "") => void;
  /** Se true, stringa vuota diventa 0 a blur. */
  emptyAsZeroOnBlur?: boolean;
};

function toDisplay(value: number | ""): string {
  if (value === "" || value === undefined || value === null) return "";
  return String(value);
}

/**
 * Input numerico cancellabile: niente "0" bloccante quando si svuota il campo.
 */
export function ClearableNumberInput({
  value,
  onValueChange,
  emptyAsZeroOnBlur = false,
  className = "",
  min,
  max,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const focusedRef = useRef(false);
  const [text, setText] = useState(() => toDisplay(value));

  useEffect(() => {
    if (!focusedRef.current) {
      setText(toDisplay(value));
    }
  }, [value]);

  function emitFromText(raw: string) {
    // Accetta cifre, segno, punto/virgola; blocca altro
    if (raw !== "" && !/^-?\d*[.,]?\d*$/.test(raw)) return;
    setText(raw);
    const trimmed = raw.trim().replace(",", ".");
    if (
      trimmed === "" ||
      trimmed === "-" ||
      trimmed === "." ||
      trimmed === "-."
    ) {
      onValueChange("");
      return;
    }
    if (trimmed.endsWith(".")) {
      const base = Number(trimmed.slice(0, -1));
      onValueChange(Number.isFinite(base) ? base : "");
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n)) onValueChange(n);
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      className={className}
      onChange={(e) => emitFromText(e.target.value)}
      onFocus={(e) => {
        focusedRef.current = true;
        onFocus?.(e);
        if (value === 0 || text === "0") {
          e.target.select();
        }
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        onBlur?.(e);
        if (text.trim() === "") {
          if (emptyAsZeroOnBlur) {
            setText("0");
            onValueChange(0);
          } else {
            setText("");
            onValueChange("");
          }
          return;
        }
        const n = Number(text.replace(",", "."));
        if (!Number.isFinite(n)) {
          setText(toDisplay(value));
          return;
        }
        let next = n;
        if (min !== undefined && min !== "" && next < Number(min)) {
          next = Number(min);
        }
        if (max !== undefined && max !== "" && next > Number(max)) {
          next = Number(max);
        }
        setText(String(next));
        onValueChange(next);
      }}
    />
  );
}

export function numberOrZero(value: number | ""): number {
  return value === "" || !Number.isFinite(value) ? 0 : value;
}
