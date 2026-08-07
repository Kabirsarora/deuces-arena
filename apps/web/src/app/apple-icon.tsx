import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#080a0d",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%"
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "#103b32",
          border: "4px solid #3dd6d0",
          borderRadius: 30,
          display: "flex",
          height: 144,
          justifyContent: "center",
          position: "relative",
          width: 116
        }}
      >
        <span style={{ color: "#f7f7f5", fontSize: 84, fontWeight: 900, lineHeight: 1 }}>D</span>
        <span
          style={{
            bottom: 10,
            color: "#f2c14e",
            fontSize: 25,
            fontWeight: 900,
            position: "absolute",
            right: 12
          }}
        >
          2
        </span>
      </div>
    </div>,
    size
  );
}
