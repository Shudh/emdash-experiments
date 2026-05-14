export class DomainError extends Error {
	constructor(
		public code: string,
		message: string,
	) {
		super(message);
		this.name = "DomainError";
	}
}

export function assertFound<T>(value: T | null, code: string, message: string): T {
	if (!value) throw new DomainError(code, message);
	return value;
}
