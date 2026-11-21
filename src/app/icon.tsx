import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e7dff8",
          color: "#6d4bc3",
          fontSize: 13,
          fontWeight: 800,
          borderRadius: 8,
        }}
      >
        S&S
      </div>
    ),
    size,
  );
}
