import { BRAND } from "../../lib/config.js";
// Logo : carré arrondi bleu avec une courbe montante stylisée.
export function BrandMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6ea0ff" /><stop offset="1" stopColor="#2c5fe0" /></linearGradient></defs>
      <rect width="32" height="32" rx="9" fill="url(#bm)" />
      <path d="M7 21.5 12.5 16l4 3.5L25 10.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="10.5" r="2.2" fill="#fff" />
    </svg>
  );
}
export default function Brand({ size = 32 }) {
  return <span className="brand"><BrandMark size={size} /><span>{BRAND.name}</span></span>;
}
