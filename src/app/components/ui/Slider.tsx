// Slider.tsx - 滑块
import React from "react";
import { cn } from "../../../lib/utils";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  style?: React.CSSProperties;
  className?: string;
}

export function Slider({ value, min, max, step = 1, onChange, style, className }: SliderProps) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{
        width: "100%",
        height: 4,
        appearance: "none",
        WebkitAppearance: "none",
        background: "var(--border)",
        borderRadius: 2,
        outline: "none",
        cursor: "pointer",
        ...style,
      }}
      className={cn(className)}
    />
  );
}
