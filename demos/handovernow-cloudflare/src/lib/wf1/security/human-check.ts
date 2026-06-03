const HUMAN_CHECK_VERSION = 1;
const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type HumanCheckChallenge = {
	v: number;
	assetId: string;
	issuedAt: number;
	expiresAt: number;
	nonce: string;
	a: number;
	b: number;
	op: "+";
	question: string;
	checksum: string;
};

export type VerifyHumanCheckInput = {
	challenge: unknown;
	answer: unknown;
	assetId: string;
	env?: unknown;
	now?: number;
};

export async function createHumanCheckChallenge(
	assetId: string,
	_env?: unknown,
	now?: number,
): Promise<HumanCheckChallenge> {
	let issuedAt = Date.now();

	if (typeof now === "number") {
		if (Number.isFinite(now) === true) {
			issuedAt = now;
		}
	}

	const a = randomInt(4, 13);
	const b = randomInt(3, 12);
	const op = "+";
	const nonce = randomToken();
	const expiresAt = issuedAt + DEFAULT_TTL_MS;
	const question = `${a} + ${b}`;

	const checksumPayload = buildChecksumPayload({
		v: HUMAN_CHECK_VERSION,
		assetId: assetId,
		issuedAt: issuedAt,
		expiresAt: expiresAt,
		nonce: nonce,
		a: a,
		b: b,
		op: op,
		question: question,
	});

	const checksum = await sha256Hex(checksumPayload);

	const challenge: HumanCheckChallenge = {
		v: HUMAN_CHECK_VERSION,
		assetId: assetId,
		issuedAt: issuedAt,
		expiresAt: expiresAt,
		nonce: nonce,
		a: a,
		b: b,
		op: op,
		question: question,
		checksum: checksum,
	};

	return challenge;
}

export async function verifyHumanCheckAnswer(input: VerifyHumanCheckInput): Promise<boolean> {
	const challenge = normalizeChallenge(input.challenge);

	if (challenge === null) {
		return false;
	}

	if (challenge.assetId !== input.assetId) {
		return false;
	}

	if (challenge.v !== HUMAN_CHECK_VERSION) {
		return false;
	}

	const now = currentTime(input.now);

	if (challenge.issuedAt > now + 60_000) {
		return false;
	}

	if (challenge.expiresAt < now) {
		return false;
	}

	const lifetimeMs = challenge.expiresAt - challenge.issuedAt;

	if (lifetimeMs > DEFAULT_TTL_MS + 60_000) {
		return false;
	}

	if (lifetimeMs <= 0) {
		return false;
	}

	const checksumPayload = buildChecksumPayload({
		v: challenge.v,
		assetId: challenge.assetId,
		issuedAt: challenge.issuedAt,
		expiresAt: challenge.expiresAt,
		nonce: challenge.nonce,
		a: challenge.a,
		b: challenge.b,
		op: challenge.op,
		question: challenge.question,
	});

	const expectedChecksum = await sha256Hex(checksumPayload);
	const checksumMatches = safeEqual(expectedChecksum, challenge.checksum);

	if (checksumMatches === false) {
		return false;
	}

	const submittedAnswer = normalizeAnswer(input.answer);

	if (submittedAnswer === null) {
		return false;
	}

	const expectedAnswer = challenge.a + challenge.b;

	if (submittedAnswer !== expectedAnswer) {
		return false;
	}

	return true;
}

type ChecksumPayloadInput = {
	v: number;
	assetId: string;
	issuedAt: number;
	expiresAt: number;
	nonce: string;
	a: number;
	b: number;
	op: "+";
	question: string;
};

function buildChecksumPayload(input: ChecksumPayloadInput): string {
	const parts: string[] = [];

	parts.push(String(input.v));
	parts.push(input.assetId);
	parts.push(String(input.issuedAt));
	parts.push(String(input.expiresAt));
	parts.push(input.nonce);
	parts.push(String(input.a));
	parts.push(input.op);
	parts.push(String(input.b));
	parts.push(input.question);

	const payload = parts.join("|");

	return payload;
}

function normalizeChallenge(value: unknown): HumanCheckChallenge | null {
	if (value === null) {
		return null;
	}

	if (value === undefined) {
		return null;
	}

	if (typeof value !== "object") {
		return null;
	}

	if (Array.isArray(value) === true) {
		return null;
	}

	const record = value as Record<string, unknown>;

	const v = normalizeInteger(record.v);
	const assetId = normalizeString(record.assetId);
	const issuedAt = normalizeNumber(record.issuedAt);
	const expiresAt = normalizeNumber(record.expiresAt);
	const nonce = normalizeString(record.nonce);
	const a = normalizeInteger(record.a);
	const b = normalizeInteger(record.b);
	const op = normalizeOperator(record.op);
	const question = normalizeString(record.question);
	const checksum = normalizeString(record.checksum);

	if (v === null) {
		return null;
	}

	if (assetId === "") {
		return null;
	}

	if (issuedAt === null) {
		return null;
	}

	if (expiresAt === null) {
		return null;
	}

	if (nonce === "") {
		return null;
	}

	if (a === null) {
		return null;
	}

	if (b === null) {
		return null;
	}

	if (op === null) {
		return null;
	}

	if (question === "") {
		return null;
	}

	if (checksum === "") {
		return null;
	}

	const challenge: HumanCheckChallenge = {
		v: v,
		assetId: assetId,
		issuedAt: issuedAt,
		expiresAt: expiresAt,
		nonce: nonce,
		a: a,
		b: b,
		op: op,
		question: question,
		checksum: checksum,
	};

	return challenge;
}

function normalizeString(value: unknown): string {
	if (typeof value !== "string") {
		return "";
	}

	const trimmedValue = value.trim();

	return trimmedValue;
}

function normalizeNumber(value: unknown): number | null {
	if (typeof value === "number") {
		if (Number.isFinite(value) === true) {
			return value;
		}

		return null;
	}

	if (typeof value === "string") {
		const numberValue = Number(value);

		if (Number.isFinite(numberValue) === true) {
			return numberValue;
		}

		return null;
	}

	return null;
}

function normalizeInteger(value: unknown): number | null {
	const numberValue = normalizeNumber(value);

	if (numberValue === null) {
		return null;
	}

	if (Number.isInteger(numberValue) === false) {
		return null;
	}

	return numberValue;
}

function normalizeOperator(value: unknown): "+" | null {
	if (value === "+") {
		return "+";
	}

	return null;
}

function normalizeAnswer(value: unknown): number | null {
	if (typeof value !== "string" && typeof value !== "number") {
		return null;
	}

	const rawValue = String(value);
	const trimmedValue = rawValue.trim();

	if (trimmedValue === "") {
		return null;
	}

	const numericPattern = /^\d{1,3}$/;
	const matchesPattern = numericPattern.test(trimmedValue);

	if (matchesPattern === false) {
		return null;
	}

	const answer = Number(trimmedValue);

	if (Number.isInteger(answer) === false) {
		return null;
	}

	return answer;
}

function currentTime(now: number | undefined): number {
	if (typeof now === "number") {
		if (Number.isFinite(now) === true) {
			return now;
		}
	}

	const timestamp = Date.now();

	return timestamp;
}

function randomInt(minInclusive: number, maxInclusive: number): number {
	const span = maxInclusive - minInclusive + 1;
	const buffer = new Uint32Array(1);

	crypto.getRandomValues(buffer);

	const rawValue = buffer[0];
	let safeRawValue = 0;

	if (rawValue !== undefined) {
		safeRawValue = rawValue;
	}

	const randomOffset = safeRawValue % span;
	const result = minInclusive + randomOffset;

	return result;
}

function randomToken(): string {
	const bytes = new Uint8Array(16);

	crypto.getRandomValues(bytes);

	const parts: string[] = [];

	for (const byte of bytes) {
		const part = byte.toString(16).padStart(2, "0");
		parts.push(part);
	}

	const token = parts.join("");

	return token;
}

async function sha256Hex(value: string): Promise<string> {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	const hex = hexFromBuffer(digest);

	return hex;
}

function hexFromBuffer(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const parts: string[] = [];

	for (const byte of bytes) {
		const part = byte.toString(16).padStart(2, "0");
		parts.push(part);
	}

	const hex = parts.join("");

	return hex;
}

function safeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) {
		return false;
	}

	let diff = 0;

	for (let index = 0; index < left.length; index += 1) {
		const leftCode = left.charCodeAt(index);
		const rightCode = right.charCodeAt(index);
		const codeDiff = leftCode ^ rightCode;

		diff = diff | codeDiff;
	}

	if (diff === 0) {
		return true;
	}

	return false;
}