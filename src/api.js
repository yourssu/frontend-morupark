const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const { accessToken, waitingToken, body, headers, ...rest } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(waitingToken ? { "X-Waiting-Token": waitingToken } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "message" in payload
        ? payload.message
        : "요청 처리에 실패했습니다. 잠시 후 다시 시도해주세요.";
    const code =
      typeof payload === "object" && payload !== null && "error" in payload ? payload.error : undefined;
    throw new ApiError(message, response.status, code);
  }

  return payload;
}

export async function login({ studentId, phoneNumber }) {
  return request("/api/auth/login", {
    method: "POST",
    body: {
      studentId: Number(studentId),
      phoneNumber,
    },
  });
}

export async function enqueue({ accessToken }) {
  return request("/api/queues", {
    method: "POST",
    accessToken,
  });
}

export async function fetchQueueStatus({ accessToken, waitingToken }) {
  return request("/api/queues/status", {
    method: "GET",
    accessToken,
    waitingToken,
  });
}
