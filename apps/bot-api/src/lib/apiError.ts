import type { FastifyReply } from "fastify";
import type { ZodError } from "zod";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

/** Every error response in the REST API uses this one shape (US-1.5). */
export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): FastifyReply {
  const body: ApiErrorBody = { error: { code, message, ...(fields ? { fields } : {}) } };
  return reply.code(statusCode).send(body);
}

/** First message per field path, for the "field-level errors" AC in US-1.5. */
export function zodErrorToFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    if (!(path in fields)) {
      fields[path] = issue.message;
    }
  }
  return fields;
}
