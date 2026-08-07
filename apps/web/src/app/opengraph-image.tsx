import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#080a0d",
        color: "#f7f7f5",
        display: "flex",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 84px",
        width: "100%"
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
        <span
          style={{
            color: "#3dd6d0",
            fontSize: 25,
            fontWeight: 900,
            letterSpacing: 0,
            textTransform: "uppercase"
          }}
        >
          Real-time Big Two
        </span>
        <span style={{ fontSize: 82, fontWeight: 900, lineHeight: 1.02, marginTop: 18 }}>
          Deuces Arena
        </span>
        <span style={{ color: "#c7cbd3", fontSize: 30, lineHeight: 1.4, marginTop: 28 }}>
          Online rooms, bot opponents, ranked play, replays, and simulation-based decision review.
        </span>
      </div>
      <div
        style={{
          alignItems: "center",
          background: "#103b32",
          border: "7px solid #3dd6d0",
          borderRadius: 64,
          display: "flex",
          height: 370,
          justifyContent: "center",
          position: "relative",
          transform: "rotate(5deg)",
          width: 285
        }}
      >
        <span style={{ fontSize: 205, fontWeight: 900, lineHeight: 1 }}>D</span>
        <span
          style={{
            bottom: 28,
            color: "#f2c14e",
            fontSize: 52,
            fontWeight: 900,
            position: "absolute",
            right: 30
          }}
        >
          2
        </span>
      </div>
    </div>,
    size
  );
}
