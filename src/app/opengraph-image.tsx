import { ImageResponse } from "next/og";

// The link preview (M10, P6; Jonathan's decision E: one image for the site).
// What LinkedIn, Slack or iMessage show when the link is shared. It uses no
// request data, so Next.js makes it once, at build time, and serves the
// same file to everyone: no cost per share.
//
// ImageResponse draws a small subset of HTML and CSS (flexbox, no Tailwind),
// so the styles are written out here.

export const alt =
  "Feature Requests: suggest features, vote on what matters, and follow what is planned.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STATUSES = [
  { label: "Open", bg: "#27272a", fg: "#d4d4d8" },
  { label: "Planned", bg: "#082f49", fg: "#7dd3fc" },
  { label: "In progress", bg: "#451a03", fg: "#fcd34d" },
  { label: "Shipped", bg: "#022c22", fg: "#6ee7b7" },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "#0a0a0a",
        color: "#ededed",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
        {/* The icon: a vote button, voted. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "112px",
            height: "112px",
            borderRadius: "24px",
            background: "#7cfc00",
            color: "#000",
            fontSize: "40px",
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex" }}>▲</div>
          <div style={{ display: "flex" }}>42</div>
        </div>
        <div style={{ display: "flex", fontSize: "80px", fontWeight: 700 }}>
          Feature Requests
        </div>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "36px",
          fontSize: "32px",
          color: "#a1a1aa",
        }}
      >
        Suggest features, vote on what matters, and follow what is planned.
      </div>
      <div style={{ display: "flex", gap: "16px", marginTop: "56px" }}>
        {STATUSES.map((s) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              padding: "10px 24px",
              borderRadius: "999px",
              background: s.bg,
              color: s.fg,
              fontSize: "28px",
            }}
          >
            {s.label}
          </div>
        ))}
      </div>
    </div>,
    { ...size },
  );
}
