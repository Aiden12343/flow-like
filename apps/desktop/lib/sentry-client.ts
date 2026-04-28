"use client";

export async function captureClientException(error: unknown): Promise<void> {
  // Keep dev noise actionable while avoiding client-bundling @sentry/nextjs.
  if (process.env.NODE_ENV !== "production") {
    console.error(error);
  }
}

export async function showClientReportDialog(options?: Record<string, unknown>): Promise<void> {
  void options;
}

export async function captureClientFeedback(feedback: Record<string, unknown>, opts?: Record<string, unknown>): Promise<void> {
  void feedback;
  void opts;
}
