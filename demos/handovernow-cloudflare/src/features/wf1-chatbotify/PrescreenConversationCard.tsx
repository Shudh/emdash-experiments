import { useMemo, useState, type KeyboardEvent } from "react";
import type { PrescreenConfig, PrescreenQuestion, PrescreenState, SubmitState } from "./types";
import { buildExpressInterestPayload } from "./prescreenMapper";
import {
	clearPrescreenState,
	createEmptyPrescreenState,
	loadPrescreenState,
	savePrescreenState,
} from "./prescreenStorage";
import { expressInterest, redirectToFromPayload } from "./wf1Api";
import TurnstileBox from "./TurnstileBox";
import { startTrace } from "./debugTrace";

const TRACE_SCOPE = "PrescreenConversationCard";
const MIN_PRESCREEN_SECONDS = 8;
const MAX_SHORT_ANSWER_LENGTH = 300;
const MAX_LONG_ANSWER_LENGTH = 1500;

type PrescreenPhase = "question" | "final_check";

type TranscriptItem = {
	role: "bot" | "visitor";
	text: string;
};

type QuestionValidationResult = {
	valid: boolean;
	error: string;
};

function initialSubmitState(): SubmitState {
	return { busy: false, error: "", success: "" };
}

function prescreenPhaseFor(config: PrescreenConfig, state: PrescreenState): PrescreenPhase {
	return state.index < config.questions.length ? "question" : "final_check";
}

function activeQuestionFor(config: PrescreenConfig, state: PrescreenState): PrescreenQuestion | null {
	if (prescreenPhaseFor(config, state) !== "question") {
		return null;
	}

	return config.questions[state.index] ?? null;
}

function validationSuccess(): QuestionValidationResult {
	return { valid: true, error: "" };
}

function validationFailure(error: string): QuestionValidationResult {
	return { valid: false, error };
}

function isValidIsoDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

	if (match === null) {
		return false;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));

	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

function maxLengthForQuestion(question: PrescreenQuestion): number {
	return question.kind === "textarea" ? MAX_LONG_ANSWER_LENGTH : MAX_SHORT_ANSWER_LENGTH;
}

function validateRequiredAnswer(question: PrescreenQuestion, trimmedValue: string): QuestionValidationResult {
	if (question.required && trimmedValue === "") {
		return validationFailure(`${question.label} is required.`);
	}

	return validationSuccess();
}

function validateAnswerLength(question: PrescreenQuestion, trimmedValue: string): QuestionValidationResult {
	const maxLength = maxLengthForQuestion(question);

	if (trimmedValue.length > maxLength) {
		return validationFailure(`Answer is too long. Please keep it under ${maxLength} characters.`);
	}

	return validationSuccess();
}

function validateEmailAnswer(trimmedValue: string): QuestionValidationResult {
	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailPattern.test(trimmedValue) ? validationSuccess() : validationFailure("Enter a valid email address.");
}

function validatePhoneAnswer(trimmedValue: string): QuestionValidationResult {
	const digitCount = trimmedValue.replace(/[^\d]/g, "").length;
	return digitCount >= 8 ? validationSuccess() : validationFailure("Enter a valid phone / WhatsApp number.");
}

function validateNumberAnswer(trimmedValue: string): QuestionValidationResult {
	const parsed = Number(trimmedValue);

	if (!Number.isFinite(parsed)) {
		return validationFailure("Enter a valid number.");
	}

	if (parsed <= 0) {
		return validationFailure("Enter a number greater than zero.");
	}

	return validationSuccess();
}

function validateDateAnswer(trimmedValue: string): QuestionValidationResult {
	return isValidIsoDate(trimmedValue) ? validationSuccess() : validationFailure("Enter a valid date.");
}

function validateQuestionKind(question: PrescreenQuestion, trimmedValue: string): QuestionValidationResult {
	if (trimmedValue === "") {
		return validationSuccess();
	}

	if (question.kind === "email") {
		return validateEmailAnswer(trimmedValue);
	}

	if (question.kind === "phone") {
		return validatePhoneAnswer(trimmedValue);
	}

	if (question.kind === "number") {
		return validateNumberAnswer(trimmedValue);
	}

	if (question.kind === "date") {
		return validateDateAnswer(trimmedValue);
	}

	return validationSuccess();
}

function validateQuestion(question: PrescreenQuestion, value: string): QuestionValidationResult {
	const trimmedValue = value.trim();
	const requiredResult = validateRequiredAnswer(question, trimmedValue);

	if (!requiredResult.valid) {
		return requiredResult;
	}

	const lengthResult = validateAnswerLength(question, trimmedValue);

	if (!lengthResult.valid) {
		return lengthResult;
	}

	return validateQuestionKind(question, trimmedValue);
}

function inputTypeFor(question: PrescreenQuestion): string {
	if (question.kind === "phone") return "tel";
	if (question.kind === "email") return "email";
	if (question.kind === "date") return "date";
	if (question.kind === "number") return "number";
	return "text";
}

function savedAnswerForQuestion(state: PrescreenState, question: PrescreenQuestion): string {
	const answer = state.answers[question.key];
	return typeof answer === "string" ? answer : "";
}

function transcriptItems(config: PrescreenConfig, state: PrescreenState): TranscriptItem[] {
	const items: TranscriptItem[] = [];

	items.push({ role: "bot", text: `Hi. I’ll collect a quick screening record for ${config.assetTitle}.` });

	const visibleCount = Math.min(state.index, config.questions.length);

	for (let index = 0; index < visibleCount; index += 1) {
		const question = config.questions[index];

		if (question === undefined) {
			continue;
		}

		const answer = savedAnswerForQuestion(state, question);
		const visibleAnswer = answer.trim() === "" ? "(blank)" : answer;

		items.push({ role: "bot", text: question.label });
		items.push({ role: "visitor", text: visibleAnswer });
	}

	return items;
}

function prescreenElapsedSeconds(state: PrescreenState): number {
	const timestamp = Date.parse(state.startedAt);

	if (!Number.isFinite(timestamp)) {
		return 0;
	}

	return Math.floor((Date.now() - timestamp) / 1000);
}

function submitStateWithError(message: string): SubmitState {
	return { busy: false, error: message, success: "" };
}

function submitStateBusy(): SubmitState {
	return { busy: true, error: "", success: "" };
}

function submitStateSuccess(message: string): SubmitState {
	return { busy: false, error: "", success: message };
}

function humanCheckAnswerIsPresent(state: PrescreenState): boolean {
	return state.humanCheckAnswer.trim() !== "";
}

function humanCheckChallengeIsExpired(config: PrescreenConfig): boolean {
	return Date.now() > config.humanCheckChallenge.expiresAt;
}

function turnstileTokenIsRequired(config: PrescreenConfig): boolean {
	return config.turnstileSiteKey !== "" && config.canSubmit;
}

function turnstileTokenIsPresent(state: PrescreenState): boolean {
	return state.turnstileToken.trim() !== "";
}

function validationErrorBeforeSubmit(config: PrescreenConfig, state: PrescreenState): string {
	if (!humanCheckAnswerIsPresent(state)) {
		return "Answer the quick check before submitting.";
	}

	if (humanCheckChallengeIsExpired(config)) {
		return "This verification expired. Please reload the page and submit again.";
	}

	const elapsedSeconds = prescreenElapsedSeconds(state);

	if (elapsedSeconds < MIN_PRESCREEN_SECONDS) {
		const remainingSeconds = MIN_PRESCREEN_SECONDS - elapsedSeconds;
		return `Please review your answers for ${remainingSeconds} more second(s), then submit.`;
	}

	if (turnstileTokenIsRequired(config) && !turnstileTokenIsPresent(state)) {
		return "Spam verification is required. Please complete the verification and submit again.";
	}

	return "";
}

function ChoiceInput(props: { question: PrescreenQuestion; onAnswer: (value: string) => void }) {
	const question = props.question;
	const onAnswer = props.onAnswer;
	const options = question.options && question.options.length > 0 ? question.options : ["Yes", "No"];

	return (
		<div className="hn-chatbotify-choice-row">
			{options.map((option) => (
				<button
					key={option}
					className="hn-chatbotify-button secondary"
					type="button"
					onClick={() => onAnswer(option)}
				>
					{option}
				</button>
			))}
		</div>
	);
}

function TextInput(props: {
	question: PrescreenQuestion;
	initialValue: string;
	onAnswer: (value: string) => void;
	onError: (message: string) => void;
}) {
	const question = props.question;
	const onAnswer = props.onAnswer;
	const onError = props.onError;
	const [value, setValue] = useState(props.initialValue);

	function submit(): void {
		const validationResult = validateQuestion(question, value);

		if (!validationResult.valid) {
			onError(validationResult.error);
			return;
		}

		onAnswer(value.trim());
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void {
		if (event.key !== "Enter") return;
		if (question.kind === "textarea") return;

		event.preventDefault();
		submit();
	}

	if (question.kind === "textarea") {
		return (
			<div className="hn-chatbotify-input-row">
				<textarea
					className="hn-chatbotify-input"
					value={value}
					onChange={(event) => setValue(event.currentTarget.value)}
					onKeyDown={handleKeyDown}
					placeholder={question.placeholder}
					aria-label={question.label}
					maxLength={MAX_LONG_ANSWER_LENGTH}
				/>
				<button className="hn-chatbotify-button" type="button" onClick={submit}>Next</button>
			</div>
		);
	}

	const inputType = inputTypeFor(question);
	const maxLength = question.kind === "number" || question.kind === "date" ? undefined : MAX_SHORT_ANSWER_LENGTH;

	return (
		<div className="hn-chatbotify-input-row">
			<input
				className="hn-chatbotify-input"
				type={inputType}
				value={value}
				onChange={(event) => setValue(event.currentTarget.value)}
				onKeyDown={handleKeyDown}
				placeholder={question.placeholder}
				aria-label={question.label}
				maxLength={maxLength}
			/>
			<button className="hn-chatbotify-button" type="button" onClick={submit}>Next</button>
		</div>
	);
}

export default function PrescreenConversationCard(props: { config: PrescreenConfig }) {
	const trace = startTrace(TRACE_SCOPE, "render", {
		assetId: props.config.assetId,
		questionCount: props.config.questions.length,
	});

	const config = props.config;
	const [state, setState] = useState<PrescreenState>(() => loadPrescreenState(config));
	const [submitState, setSubmitState] = useState<SubmitState>(initialSubmitState);
	const [honeypotValue, setHoneypotValue] = useState("");

	const transcript = useMemo(() => transcriptItems(config, state), [config, state]);

	function updateState(updater: (current: PrescreenState) => PrescreenState): void {
		setState((current) => {
			const next = updater(current);
			savePrescreenState(config, next);
			return next;
		});
	}

	function setError(message: string): void {
		setSubmitState(submitStateWithError(message));
	}

	function resetSubmitState(): void {
		setSubmitState(initialSubmitState());
	}

	function answerCurrentQuestion(value: string): void {
		const question = activeQuestionFor(config, state);

		if (question === null) {
			return;
		}

		updateState((current) => ({
			...current,
			index: current.index + 1,
			answers: {
				...current.answers,
				[question.key]: value,
			},
		}));

		resetSubmitState();
	}

	function goBack(): void {
		updateState((current) => ({
			...current,
			index: Math.max(0, current.index - 1),
		}));
		resetSubmitState();
	}

	function resetPrescreen(): void {
		const emptyState = createEmptyPrescreenState(config);
		clearPrescreenState(config);
		setState(emptyState);
		setHoneypotValue("");
		setSubmitState(initialSubmitState());
	}

	function setHumanCheckAnswer(value: string): void {
		updateState((current) => ({ ...current, humanCheckAnswer: value }));
	}

	function setTurnstileToken(token: string): void {
		updateState((current) => ({ ...current, turnstileToken: token }));
	}

	function redirectToLoginAfterSavingDraft(): void {
		savePrescreenState(config, state);
		window.location.href = config.loginHref;
	}

	async function submitApplication(): Promise<void> {
		const submitTrace = startTrace(TRACE_SCOPE, "submitApplication", {
			assetId: config.assetId,
			canSubmit: config.canSubmit,
			index: state.index,
			answerCount: Object.keys(state.answers).length,
		});

		const validationError = validationErrorBeforeSubmit(config, state);

		if (validationError !== "") {
			setError(validationError);
			submitTrace.end({ submitted: false, stage: "client validation", error: validationError });
			return;
		}

		if (!config.canSubmit) {
			redirectToLoginAfterSavingDraft();
			submitTrace.end({ submitted: false, stage: "login redirect" });
			return;
		}

		setSubmitState(submitStateBusy());

		const body = buildExpressInterestPayload(config, state, honeypotValue);
		const result = await expressInterest(config.action, body);

		if (!result.ok) {
			setSubmitState(submitStateWithError(result.error));
			submitTrace.end({ submitted: false, stage: "api failure", error: result.error });
			return;
		}

		clearPrescreenState(config);
		setSubmitState(submitStateSuccess("Application submitted."));

		const redirectTo = redirectToFromPayload(result.payload);

		if (redirectTo !== "") {
			window.location.href = redirectTo;
			submitTrace.end({ submitted: true, redirectTo });
			return;
		}

		submitTrace.end({ submitted: true, redirectTo: "" });
	}

	const phase = prescreenPhaseFor(config, state);
	const activeQuestion = activeQuestionFor(config, state);
	const showTurnstile = phase === "final_check" && config.turnstileSiteKey !== "" && config.canSubmit;

	trace.end({ phase, activeQuestionKey: activeQuestion?.key ?? "", showTurnstile });

	return (
		<div className="hn-prescreen-card">
			<div className="hn-prescreen-toolbar">
				<button className="hn-chatbotify-button secondary" type="button" onClick={resetPrescreen}>Start over</button>
			</div>

			<div className="hn-prescreen-transcript">
				{transcript.map((item, index) => (
					<div key={`${item.role}-${index}`} className={`hn-prescreen-message ${item.role}`}>{item.text}</div>
				))}

				{activeQuestion !== null ? (
					<div className="hn-prescreen-message bot">{activeQuestion.label}</div>
				) : (
					<div className="hn-prescreen-message bot">{`One quick check before submitting: ${config.humanCheckChallenge.question}`}</div>
				)}
			</div>

			<div className="hn-prescreen-control">
				{activeQuestion !== null ? (
					activeQuestion.kind === "single_choice" ? (
						<ChoiceInput question={activeQuestion} onAnswer={answerCurrentQuestion} />
					) : (
						<TextInput
							key={activeQuestion.key}
							question={activeQuestion}
							initialValue={state.answers[activeQuestion.key] ?? ""}
							onAnswer={answerCurrentQuestion}
							onError={setError}
						/>
					)
				) : (
					<div className="hn-prescreen-final">
						<input
							className="hn-chatbotify-input"
							type="number"
							inputMode="numeric"
							value={state.humanCheckAnswer}
							onChange={(event) => setHumanCheckAnswer(event.currentTarget.value)}
							placeholder="Answer"
							aria-label="Human check answer"
						/>
						<button className="hn-chatbotify-button secondary" type="button" onClick={goBack}>Back</button>
						<button className="hn-chatbotify-button" type="button" disabled={submitState.busy} onClick={submitApplication}>
							{submitState.busy ? "Submitting..." : config.canSubmit ? "Submit application" : "Login and submit"}
						</button>
					</div>
				)}
			</div>

			{showTurnstile ? <TurnstileBox siteKey={config.turnstileSiteKey} onToken={setTurnstileToken} onError={setError} /> : null}

			<div className="hn-hidden-trap" aria-hidden="true">
				<label>
					Company website
					<input type="text" tabIndex={-1} autoComplete="off" value={honeypotValue} onChange={(event) => setHoneypotValue(event.currentTarget.value)} />
				</label>
			</div>

			{submitState.error !== "" ? <p className="hn-chatbotify-error">{submitState.error}</p> : null}
			{submitState.success !== "" ? <p className="hn-chatbotify-success">{submitState.success}</p> : null}
		</div>
	);
}
