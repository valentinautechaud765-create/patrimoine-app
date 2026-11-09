import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg, #176E9F 0%, #084B7B 52%, #08264D 100%)" }}>
      <svg width="126" height="105" viewBox="0 0 512 380">
        <path d="M205 237C226 188 274 139 366 111C367 158 346 190 309 207C276 222 238 226 205 237Z" fill="#D7F6FF"/>
        <path d="M105 326C166 259 247 220 391 199C376 248 344 278 295 292C226 312 159 318 105 326Z" fill="#79CDEB"/>
        <path d="M119 347C184 329 260 302 383 276C361 318 325 343 272 354C215 366 164 361 119 347Z" fill="#2586BB"/>
      </svg>
      <div style={{ display: "flex", color: "#F7FBFF", fontSize: 25, fontWeight: 500, letterSpacing: "-1px", marginTop: 1 }}>Patrimo</div>
    </div>,
    { ...size }
  );
}
