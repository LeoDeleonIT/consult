import { ZodError } from "zod";

export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable = false,
    readonly code = "public_error",
  ) {
    super(message);
    this.name = "PublicApiError";
  }
}

export function apiError(error: unknown): Response {
  if (error instanceof Response) return error;
  if (error instanceof PublicApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json({ error: "Please check the submitted information.", details: error.issues }, { status: 400 });
  }
  if (error instanceof Error && error.message.startsWith("Invalid consultation state transition")) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  return Response.json({ error: "The request could not be completed. Please try again." }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}
