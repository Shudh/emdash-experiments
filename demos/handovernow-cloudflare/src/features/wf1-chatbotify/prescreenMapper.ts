import type { PrescreenAnswer, PrescreenConfig, PrescreenState } from "./types";
import { startTrace } from "./debugTrace";

const TRACE_SCOPE = "prescreenMapper";

type MappedPrescreenValues = {
	name: string;
	officialEmail: string;
	phone: string;
	employerName: string;
	offeredPrice: number | undefined;
	requestedStartDate: string;
	requestedMinimumMonths: number | undefined;
	message: string;
};

function stringFromAnswerMap(answers: Record<string, string>, key: string): string {
	const trace = startTrace(TRACE_SCOPE, "stringFromAnswerMap", { key, answerKeys: Object.keys(answers) });
	const value = answers[key];

	if (typeof value !== "string") {
		trace.end({ result: "", reason: "answer value is missing or not a string" });
		return "";
	}

	trace.end({ result: value, resultLength: value.length });
	return value;
}

export function buildAnswerList(config: PrescreenConfig, state: PrescreenState): PrescreenAnswer[] {
	const trace = startTrace(TRACE_SCOPE, "buildAnswerList", {
		assetId: config.assetId,
		questionCount: config.questions.length,
		answerKeys: Object.keys(state.answers),
	});

	const answers: PrescreenAnswer[] = [];

	for (const question of config.questions) {
		answers.push({
			key: question.key,
			label: question.label,
			answer: stringFromAnswerMap(state.answers, question.key),
			target: question.target,
		});
	}

	trace.end({ resultCount: answers.length });
	return answers;
}

function valueFromMap(map: Map<string, string>, key: string): string {
	const value = map.get(key);
	return value === undefined ? "" : value;
}

function positiveNumberOrUndefined(value: string): number | undefined {
	const trimmedValue = value.trim();

	if (trimmedValue === "") {
		return undefined;
	}

	const parsed = Number(trimmedValue);

	if (!Number.isFinite(parsed) || parsed <= 0) {
		return undefined;
	}

	return parsed;
}

function answerShouldBeMapped(value: unknown): value is string {
	if (typeof value !== "string") {
		return false;
	}

	return value.trim() !== "";
}

function addQuestionValueToTargetMap(
	byTarget: Map<string, string>,
	questionKey: string,
	questionTarget: string,
	answerValue: string,
): void {
	if (questionTarget.trim() !== "") {
		byTarget.set(questionTarget, answerValue);
	}

	byTarget.set(questionKey, answerValue);
}

function buildTargetMap(config: PrescreenConfig, state: PrescreenState): Map<string, string> {
	const trace = startTrace(TRACE_SCOPE, "buildTargetMap", {
		assetId: config.assetId,
		questionCount: config.questions.length,
		answerKeys: Object.keys(state.answers),
	});

	const byTarget = new Map<string, string>();

	for (const question of config.questions) {
		const value = state.answers[question.key];

		if (!answerShouldBeMapped(value)) {
			continue;
		}

		addQuestionValueToTargetMap(byTarget, question.key, question.target, value);
	}

	trace.end({ mapSize: byTarget.size, mapKeys: Array.from(byTarget.keys()) });
	return byTarget;
}

function messageFromMappedValues(byTarget: Map<string, string>): string {
	const directMessage = valueFromMap(byTarget, "message");

	if (directMessage !== "") {
		return directMessage;
	}

	return valueFromMap(byTarget, "final_note");
}

export function mappedValues(config: PrescreenConfig, state: PrescreenState): MappedPrescreenValues {
	const trace = startTrace(TRACE_SCOPE, "mappedValues", {
		assetId: config.assetId,
		questionCount: config.questions.length,
		answerKeys: Object.keys(state.answers),
	});

	const byTarget = buildTargetMap(config, state);
	const offeredPriceText = valueFromMap(byTarget, "offeredPrice");
	const requestedMinimumMonthsText = valueFromMap(byTarget, "requestedMinimumMonths");

	const mapped: MappedPrescreenValues = {
		name: valueFromMap(byTarget, "name"),
		officialEmail: valueFromMap(byTarget, "officialEmail"),
		phone: valueFromMap(byTarget, "phone"),
		employerName: valueFromMap(byTarget, "employerName"),
		offeredPrice: positiveNumberOrUndefined(offeredPriceText),
		requestedStartDate: valueFromMap(byTarget, "requestedStartDate"),
		requestedMinimumMonths: positiveNumberOrUndefined(requestedMinimumMonthsText),
		message: messageFromMappedValues(byTarget),
	};

	trace.end({
		nameWasMapped: mapped.name !== "",
		emailWasMapped: mapped.officialEmail !== "",
		phoneWasMapped: mapped.phone !== "",
		employerWasMapped: mapped.employerName !== "",
		offeredPriceWasMapped: mapped.offeredPrice !== undefined,
		requestedStartDateWasMapped: mapped.requestedStartDate !== "",
		requestedMinimumMonthsWasMapped: mapped.requestedMinimumMonths !== undefined,
		messageWasMapped: mapped.message !== "",
	});

	return mapped;
}

function buildHumanCheckPayload(config: PrescreenConfig, state: PrescreenState): Record<string, unknown> {
	return {
		challenge: config.humanCheckChallenge,
		answer: state.humanCheckAnswer,
	};
}

function buildPrescreenMetadata(
	config: PrescreenConfig,
	state: PrescreenState,
	answers: PrescreenAnswer[],
): Record<string, unknown> {
	return {
		kind: "chat_wizard",
		version: 5,
		source: "wf1_marketplace_asset_detail_chatbotify",
		assetId: config.assetId,
		assetTitle: config.assetTitle,
		startedAt: state.startedAt,
		submittedAt: new Date().toISOString(),
		answers,
		turnstileDisplayed: config.turnstileSiteKey !== "",
	};
}

function buildInterestSpec(
	config: PrescreenConfig,
	state: PrescreenState,
	answers: PrescreenAnswer[],
): Record<string, unknown> {
	return {
		prescreen: buildPrescreenMetadata(config, state, answers),
	};
}

function addOptionalNumberField(body: Record<string, unknown>, fieldName: string, value: number | undefined): void {
	if (value === undefined) {
		return;
	}

	body[fieldName] = value;
}

function addTurnstileTokenIfPresent(body: Record<string, unknown>, token: string): void {
	const trimmedToken = token.trim();

	if (trimmedToken === "") {
		return;
	}

	body.turnstileToken = trimmedToken;
}

export function buildExpressInterestPayload(
	config: PrescreenConfig,
	state: PrescreenState,
	honeypotValue: string,
): Record<string, unknown> {
	const trace = startTrace(TRACE_SCOPE, "buildExpressInterestPayload", {
		assetId: config.assetId,
		assetTitle: config.assetTitle,
		canSubmit: config.canSubmit,
		questionCount: config.questions.length,
		answerKeys: Object.keys(state.answers),
		honeypotLength: honeypotValue.length,
	});

	const answers = buildAnswerList(config, state);
	const mapped = mappedValues(config, state);

	const body: Record<string, unknown> = {
		name: mapped.name,
		officialEmail: mapped.officialEmail,
		phone: mapped.phone,
		employerName: mapped.employerName,
		requestedStartDate: mapped.requestedStartDate,
		message: mapped.message,
		acceptedConditionsVersion: config.acceptedConditionsVersion,
		acceptedConditionsHash: config.acceptedConditionsHash,
		prescreenStartedAt: state.startedAt,
		_hp: honeypotValue,
		humanCheck: buildHumanCheckPayload(config, state),
		interestSpec: buildInterestSpec(config, state, answers),
	};

	addOptionalNumberField(body, "offeredPrice", mapped.offeredPrice);
	addOptionalNumberField(body, "requestedMinimumMonths", mapped.requestedMinimumMonths);
	addTurnstileTokenIfPresent(body, state.turnstileToken);

	trace.end({ bodyKeys: Object.keys(body), hasTurnstileToken: "turnstileToken" in body });
	return body;
}
