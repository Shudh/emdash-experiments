import { DomainError, asJsonObject } from "../../domain/types.js";
import type { WorkflowAnswerSchema, WorkflowEvidencePolicy } from "./types.js";

export function validateAnswer(
	schema: WorkflowAnswerSchema,
	value: unknown,
): Record<string, unknown> {
	const answer = asJsonObject(value);
	if (schema.kind === "none") return {};
	if (schema.kind === "free_text") {
		const text = typeof answer.text === "string" ? answer.text.trim() : "";
		if (schema.minLength !== undefined && text.length < schema.minLength) {
			throw new DomainError("INVALID_ANSWER", "Answer text is too short", 422);
		}
		if (schema.maxLength !== undefined && text.length > schema.maxLength) {
			throw new DomainError("INVALID_ANSWER", "Answer text is too long", 422);
		}
		return { text };
	}
	if (schema.kind === "yes_no") {
		if (answer.value !== "yes" && answer.value !== "no") {
			throw new DomainError("INVALID_ANSWER", "Answer must be yes or no", 422);
		}
		return { value: answer.value };
	}
	if (schema.kind === "amount_proof") {
		const amount = typeof answer.amount === "number" ? answer.amount : Number(answer.amount);
		if (schema.amountRequired && !Number.isFinite(amount)) {
			throw new DomainError("INVALID_ANSWER", "Amount is required", 422);
		}
		if (schema.referenceRequired && typeof answer.reference !== "string") {
			throw new DomainError("INVALID_ANSWER", "Reference is required", 422);
		}
		return { ...answer, amount: Number.isFinite(amount) ? amount : undefined };
	}
	if (schema.kind === "mcq_single") {
		const option = typeof answer.value === "string" ? answer.value : "";
		if (!schema.options.some((candidate) => candidate.value === option)) {
			throw new DomainError("INVALID_ANSWER", "Selected option is not allowed", 422);
		}
		return { value: option };
	}
	if (schema.kind === "mcq_multi") {
		const values = Array.isArray(answer.values) ? answer.values.map(String) : [];
		const allowed = new Set(schema.options.map((candidate) => candidate.value));
		if (values.some((selectedValue) => !allowed.has(selectedValue))) {
			throw new DomainError("INVALID_ANSWER", "Selected option is not allowed", 422);
		}
		return { values };
	}
	return answer;
}

export function validateEvidencePolicy(
	policy: WorkflowEvidencePolicy,
	attachments: Array<Record<string, unknown>>,
): void {
	if (policy.attachment === "forbidden" && attachments.length) {
		throw new DomainError("EVIDENCE_FORBIDDEN", "This card does not accept evidence", 422);
	}
	if (policy.attachment === "required" && !attachments.length) {
		throw new DomainError("EVIDENCE_REQUIRED", "Evidence is required", 422);
	}
}
