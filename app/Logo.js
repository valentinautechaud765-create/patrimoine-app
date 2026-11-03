import { BRAND } from "../lib/config.js";
export default function Logo() {
  return <span className="logo"><span className="logoMark">{BRAND.name.slice(0, 1)}</span>{BRAND.name}</span>;
}
