const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]+/g;
const EDGE_DASH_PATTERN = /^-+|-+$/g;

export function createId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function slugify(value: string): string {
	return (
		value.toLowerCase().replace(NON_ALPHANUMERIC_PATTERN, "-").replace(EDGE_DASH_PATTERN, "") ||
		"item"
	);
}

export function nowIso(): string {
	return new Date().toISOString();
}
