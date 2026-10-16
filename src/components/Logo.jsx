import React from "react";

// Logo ScoutOS: lupa nad středem hřiště. Barva se řídí přes `color` (currentColor), oranžový bod je akcent.
export default function LogoMark({ size = 22, color = "#2F6B4F", accent = "#C98A2C", title = "ScoutOS" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} style={{ color, flexShrink: 0 }}>
      <circle cx="28" cy="28" r="19" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <line x1="42" y1="42" x2="57" y2="57" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <line x1="28" y1="14" x2="28" y2="42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="28" cy="28" r="6.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="28" cy="28" r="2.4" fill={accent} />
    </svg>
  );
}
