"use client";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 16,
            padding: "0 24px",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 600 }}>오류가 발생했습니다</h2>
          <p style={{ fontSize: "13px", color: "#666", maxWidth: "400px" }}>
            {error?.message || "알 수 없는 오류입니다."}
          </p>
          {error?.digest && (
            <p style={{ fontSize: "11px", color: "#999" }}>digest: {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{
              padding: "8px 16px",
              background: "#7b39fc",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
