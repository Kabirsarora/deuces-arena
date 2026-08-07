import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512
};

export const contentType = "image/png";

export default function Icon() {
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
          border: "8px solid #3dd6d0",
          borderRadius: 88,
          boxShadow: "inset 0 0 0 14px #0a241f",
          display: "flex",
          height: 410,
          justifyContent: "center",
          position: "relative",
          width: 330
        }}
      >
        <span
          style={{
            color: "#f7f7f5",
            fontSize: 238,
            fontWeight: 900,
            lineHeight: 1
          }}
        >
          D
        </span>
        <span
          style={{
            bottom: 28,
            color: "#f2c14e",
            fontSize: 58,
            fontWeight: 900,
            position: "absolute",
            right: 34
          }}
        >
          2
        </span>
      </div>
    </div>,
    size
  );
}
