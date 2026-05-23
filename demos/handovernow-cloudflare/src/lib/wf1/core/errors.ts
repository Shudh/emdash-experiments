import { DomainError } from "../../domain/types.js";

export { DomainError };

export function notFound(label: string): DomainError {
	return new DomainError("NOT_FOUND", `${label} not found`, 404);
}

export function forbidden(message = "Workflow action is not allowed"): DomainError {
	return new DomainError("FORBIDDEN", message, 403);
}

export function validationError(message: string): DomainError {
	return new DomainError("VALIDATION_ERROR", message, 400);
}
