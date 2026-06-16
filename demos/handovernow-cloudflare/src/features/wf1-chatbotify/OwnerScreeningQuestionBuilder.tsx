import { useEffect, useMemo, useState } from "react";
import type { PrescreenQuestion, PrescreenQuestionKind } from "./types";
import HandoverNowAgentDialog from "./HandoverNowAgentDialog";
import HandoverNowChatbotifyShell from "./HandoverNowChatbotifyShell";
import { useOwnerAssetDraft, type OwnerAssetDraftAction, type OwnerAssetDraftStore } from "./ownerAssetDraft";
import "./wf1-chatbotify.css";

type OwnerScreeningQuestionBuilderProps = {
	fieldName?: string;
	initialQuestions?: PrescreenQuestion[];
	draftKey?: string;
};

type AgentStep = "menu" | "review" | "add" | "pick_edit" | "edit" | "pick_remove";

type AgentTask =
	| { type: "menu"; nonce: number }
	| { type: "review"; nonce: number }
	| { type: "add"; nonce: number }
	| { type: "edit"; index: number; nonce: number };

type QuestionDraft = {
	label: string;
	kind: PrescreenQuestionKind;
	required: boolean;
	placeholder: string;
	optionsText: string;
	target: string;
};

const FIELD_NAME = "preScreenQuestionsJson";

const DEFAULT_QUESTIONS: PrescreenQuestion[] = [
	{ key: "name", label: "What is your full name?", kind: "text", required: true, target: "name", placeholder: "Your name" },
	{ key: "phone_whatsapp", label: "What is your phone / WhatsApp number?", kind: "phone", required: true, target: "phone", placeholder: "+91..." },
	{ key: "official_email", label: "What email should we keep on record?", kind: "email", required: true, target: "officialEmail", placeholder: "name@example.com" },
	{ key: "move_in_date", label: "When do you want to move in?", kind: "date", required: true, target: "requestedStartDate", placeholder: "" },
	{ key: "minimum_stay", label: "Can you stay for the owner’s minimum stay requirement?", kind: "single_choice", required: true, options: ["Yes", "Need to discuss"], target: "minimumStayAccepted", placeholder: "" },
	{ key: "requested_minimum_months", label: "How many months do you expect to stay?", kind: "number", required: true, target: "requestedMinimumMonths", placeholder: "11" },
	{ key: "occupants", label: "Who will live in the flat?", kind: "textarea", required: true, target: "occupants", placeholder: "Example: husband, wife, one child" },
	{ key: "employer", label: "Where do you work, or what is your income source?", kind: "text", required: true, target: "employerName", placeholder: "Company / business / profession" },
	{ key: "rent_acceptance", label: "Are you comfortable with the listed rent and stated terms?", kind: "single_choice", required: true, options: ["Yes", "Need to discuss"], target: "rentAcceptance", placeholder: "" },
	{ key: "offered_price", label: "If you want to make a rent offer, enter the monthly amount. Leave blank if you accept the listed rent.", kind: "number", required: false, target: "offeredPrice", placeholder: "33000" },
	{ key: "normal_residential_use", label: "Will this be used only as a normal residence, not Airbnb, guest-house, or short stay?", kind: "single_choice", required: true, options: ["Yes, normal residence only", "Need to discuss"], target: "normalResidentialUse", placeholder: "" },
	{ key: "final_note", label: "Anything else the owner should know before calling you?", kind: "textarea", required: false, target: "message", placeholder: "Write a short note for the owner" },
];

const KIND_OPTIONS: Array<{ value: PrescreenQuestionKind; label: string }> = [
	{ value: "text", label: "Free text" },
	{ value: "textarea", label: "Long answer" },
	{ value: "single_choice", label: "Single choice" },
	{ value: "phone", label: "Phone" },
	{ value: "email", label: "Email" },
	{ value: "date", label: "Date" },
	{ value: "number", label: "Number" },
];

function normalizeQuestion(question: PrescreenQuestion): PrescreenQuestion {
	return {
		key: question.key,
		label: question.label,
		kind: question.kind,
		required: question.required !== false,
		options: question.kind === "single_choice" ? question.options ?? ["Yes", "No"] : [],
		target: question.target || question.key,
		placeholder: question.placeholder ?? "",
	};
}

function initialQuestionsFromProps(questions: PrescreenQuestion[] | undefined): PrescreenQuestion[] {
	const source = Array.isArray(questions) && questions.length > 0 ? questions : DEFAULT_QUESTIONS;
	return source.map(normalizeQuestion);
}

function defaultQuestions(): PrescreenQuestion[] {
	return DEFAULT_QUESTIONS.map(normalizeQuestion);
}

function questionKindLabel(kind: PrescreenQuestionKind): string {
	return KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function templateChanged(questions: PrescreenQuestion[]): boolean {
	if (questions.length !== DEFAULT_QUESTIONS.length) return true;
	return questions.some((question, index) => JSON.stringify(normalizeQuestion(question)) !== JSON.stringify(normalizeQuestion(DEFAULT_QUESTIONS[index] as PrescreenQuestion)));
}

function keyFromLabel(label: string, existingKeys: Set<string>): string {
	const base = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 48) || "question";

	let key = base;
	let suffix = 2;

	while (existingKeys.has(key)) {
		key = `${base}_${suffix}`;
		suffix += 1;
	}

	return key;
}

function optionsFromText(value: string): string[] {
	const options = value
		.split("\n")
		.map((item) => item.trim())
		.filter((item) => item !== "");

	return options.length > 0 ? options : ["Yes", "No"];
}

function optionsToText(options: string[] | undefined): string {
	return Array.isArray(options) && options.length > 0 ? options.join("\n") : "Yes\nNo";
}

function emptyDraft(): QuestionDraft {
	return {
		label: "",
		kind: "text",
		required: true,
		placeholder: "",
		optionsText: "Yes\nNo",
		target: "",
	};
}

function draftFromQuestion(question: PrescreenQuestion): QuestionDraft {
	return {
		label: question.label,
		kind: question.kind,
		required: question.required,
		placeholder: question.placeholder ?? "",
		optionsText: optionsToText(question.options),
		target: question.target,
	};
}

function questionFromDraft(draft: QuestionDraft, existingKeys: Set<string>, existingKey?: string): PrescreenQuestion | null {
	const label = draft.label.trim();
	if (label === "") return null;

	const key = existingKey ?? keyFromLabel(label, existingKeys);
	const target = draft.target.trim() === "" ? key : draft.target.trim();

	return normalizeQuestion({
		key,
		label,
		kind: draft.kind,
		required: draft.required,
		placeholder: draft.placeholder.trim(),
		target,
		options: draft.kind === "single_choice" ? optionsFromText(draft.optionsText) : [],
	});
}

function dispatchQuestions(dispatch: OwnerAssetDraftStore["dispatch"], questions: PrescreenQuestion[]): void {
	dispatch({ type: "SCREENING_QUESTIONS_REPLACED", questions });
}

function ScreeningQuestionCarousel(props: {
	questions: PrescreenQuestion[];
	onEdit: (index: number) => void;
	onRemove: (index: number) => void;
	onMove: (index: number, direction: -1 | 1) => void;
}) {
	if (props.questions.length === 0) {
		return <p className="hn-chatbotify-note">No screening questions are configured.</p>;
	}

	return (
		<div className="hn-question-carousel">
			{props.questions.map((question, index) => (
				<article key={`${question.key}-${index}`} className="hn-question-card">
					<div className="hn-question-card-header">
						<strong>{`Q${index + 1}`}</strong>
						<span>{questionKindLabel(question.kind)}</span>
					</div>
					<p>{question.label}</p>
					<small>{question.required ? "Required" : "Optional"}</small>
					<div className="hn-chatbotify-choice-row">
						<button className="hn-chatbotify-button secondary" type="button" onClick={() => props.onEdit(index)}>Edit</button>
						<button className="hn-chatbotify-button secondary" type="button" onClick={() => props.onRemove(index)}>Delete</button>
						<button className="hn-chatbotify-button secondary" type="button" disabled={index === 0} onClick={() => props.onMove(index, -1)}>←</button>
						<button className="hn-chatbotify-button secondary" type="button" disabled={index === props.questions.length - 1} onClick={() => props.onMove(index, 1)}>→</button>
					</div>
				</article>
			))}
		</div>
	);
}

function DraftEditor(props: {
	draft: QuestionDraft;
	error: string;
	selectedIndex: number | null;
	onDraftChange: (draft: QuestionDraft) => void;
	onSave: () => void;
	onCancel: () => void;
}) {
	return (
		<div className="hn-prescreen-card">
			<div className="hn-prescreen-transcript">
				<div className="hn-prescreen-message bot">
					{props.selectedIndex === null ? "Tell me the screening question to add." : `Edit Q${props.selectedIndex + 1}.`}
				</div>
			</div>

			<div className="hn-prescreen-control">
				<label className="hn-chatbotify-field">
					<span>Question</span>
					<input
						value={props.draft.label}
						onChange={(event) => props.onDraftChange({ ...props.draft, label: event.currentTarget.value })}
						placeholder="Example: Do you have pets?"
					/>
				</label>

				<label className="hn-chatbotify-field">
					<span>Question type</span>
					<select
						value={props.draft.kind}
						onChange={(event) => props.onDraftChange({ ...props.draft, kind: event.currentTarget.value as PrescreenQuestionKind })}
					>
						{KIND_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>{option.label}</option>
						))}
					</select>
				</label>

				<label className="hn-chatbotify-field">
					<span>Required?</span>
					<select
						value={props.draft.required ? "yes" : "no"}
						onChange={(event) => props.onDraftChange({ ...props.draft, required: event.currentTarget.value === "yes" })}
					>
						<option value="yes">Required</option>
						<option value="no">Optional</option>
					</select>
				</label>

				{props.draft.kind === "single_choice" ? (
					<label className="hn-chatbotify-field">
						<span>Options, one per line</span>
						<textarea
							value={props.draft.optionsText}
							onChange={(event) => props.onDraftChange({ ...props.draft, optionsText: event.currentTarget.value })}
						/>
					</label>
				) : null}

				<details>
					<summary>Advanced</summary>
					<label className="hn-chatbotify-field">
						<span>Placeholder</span>
						<input
							value={props.draft.placeholder}
							onChange={(event) => props.onDraftChange({ ...props.draft, placeholder: event.currentTarget.value })}
						/>
					</label>
					<label className="hn-chatbotify-field">
						<span>Target field</span>
						<input
							value={props.draft.target}
							onChange={(event) => props.onDraftChange({ ...props.draft, target: event.currentTarget.value })}
							placeholder="Optional stable target key"
						/>
					</label>
				</details>
			</div>

			{props.error !== "" ? <p className="hn-chatbotify-error">{props.error}</p> : null}

			<div className="hn-chatbotify-choice-row">
				<button className="hn-chatbotify-button" type="button" onClick={props.onSave}>
					{props.selectedIndex === null ? "Add question" : "Save question"}
				</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={props.onCancel}>Cancel</button>
			</div>
		</div>
	);
}

function OwnerScreeningAgentCard(props: {
	draftStore: OwnerAssetDraftStore;
	initialTask: AgentTask;
	onClose: () => void;
}) {
	const [step, setStep] = useState<AgentStep>("menu");
	const [draft, setDraft] = useState<QuestionDraft>(() => emptyDraft());
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [error, setError] = useState("");
	const [localRevision, setLocalRevision] = useState(0);

	function questions(): PrescreenQuestion[] {
		return props.draftStore.getSnapshot().ownerConditionsSpec.preScreenQuestions;
	}

	function bump(): void {
		setLocalRevision((current) => current + 1);
	}

	function dispatch(action: OwnerAssetDraftAction): void {
		props.draftStore.dispatch(action);
		bump();
	}

	function resetDraft(): void {
		setDraft(emptyDraft());
		setSelectedIndex(null);
		setError("");
	}

	function startAdd(): void {
		resetDraft();
		setStep("add");
	}

	function startEdit(index: number): void {
		const question = questions()[index];
		if (!question) {
			setError("That question number does not exist.");
			return;
		}

		setSelectedIndex(index);
		setDraft(draftFromQuestion(question));
		setError("");
		setStep("edit");
	}

	function removeQuestion(index: number): void {
		if (!questions()[index]) {
			setError("That question number does not exist.");
			return;
		}

		dispatch({ type: "SCREENING_QUESTION_REMOVED", index });
		resetDraft();
		setStep("review");
	}

	function saveDraft(): void {
		const currentQuestions = questions();
		const existingKeys = new Set(currentQuestions.map((question) => question.key));
		const existingKey = selectedIndex === null ? undefined : currentQuestions[selectedIndex]?.key;
		const question = questionFromDraft(draft, existingKeys, existingKey);

		if (question === null) {
			setError("Write the question first.");
			return;
		}

		if (selectedIndex === null) {
			dispatch({ type: "SCREENING_QUESTION_ADDED", question });
		} else {
			dispatch({ type: "SCREENING_QUESTION_UPDATED", index: selectedIndex, question });
		}

		resetDraft();
		setStep("review");
	}

	function useDefault(): void {
		if (templateChanged(questions()) && !window.confirm("Replace the current screening questions with the default set?")) {
			return;
		}

		dispatchQuestions(props.draftStore.dispatch, defaultQuestions());
		bump();
		resetDraft();
		setStep("review");
	}

	function startBlank(): void {
		if (questions().length > 0 && !window.confirm("Remove all screening questions and start blank?")) {
			return;
		}

		dispatchQuestions(props.draftStore.dispatch, []);
		bump();
		resetDraft();
		setStep("review");
	}

	function moveQuestionAt(index: number, direction: -1 | 1): void {
		dispatch({ type: "SCREENING_QUESTION_MOVED", index, direction });
		setStep("review");
	}

	useEffect(() => {
		resetDraft();

		if (props.initialTask.type === "add") {
			setStep("add");
			return;
		}

		if (props.initialTask.type === "edit") {
			startEdit(props.initialTask.index);
			return;
		}

		if (props.initialTask.type === "review") {
			setStep("review");
			return;
		}

		setStep("menu");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.initialTask.nonce]);

	const currentQuestions = questions();
	void localRevision;

	if (step === "add" || step === "edit") {
		return (
			<DraftEditor
				draft={draft}
				error={error}
				selectedIndex={selectedIndex}
				onDraftChange={setDraft}
				onSave={saveDraft}
				onCancel={() => {
					resetDraft();
					setStep("menu");
				}}
			/>
		);
	}

	return (
		<div className="hn-prescreen-card">
			<div className="hn-prescreen-transcript">
				<div className="hn-prescreen-message bot">
					{step === "review"
						? "Here is the current browser-side screening draft. This is live; it includes changes made while this dialog is open."
						: step === "pick_edit"
							? "Which question number should I edit?"
							: step === "pick_remove"
								? "Which question number should I remove?"
								: `I can use the default screening, add a question, edit by number, remove by number, or start blank. Current browser draft: ${currentQuestions.length} question(s).`}
				</div>
			</div>

			{step === "review" ? (
				<ScreeningQuestionCarousel
					questions={currentQuestions}
					onEdit={startEdit}
					onRemove={removeQuestion}
					onMove={moveQuestionAt}
				/>
			) : null}

			{step === "pick_edit" ? (
				<div className="hn-chatbotify-choice-row">
					{currentQuestions.map((_question, index) => (
						<button key={`edit-${index}`} className="hn-chatbotify-button secondary" type="button" onClick={() => startEdit(index)}>
							{`Q${index + 1}`}
						</button>
					))}
				</div>
			) : null}

			{step === "pick_remove" ? (
				<div className="hn-chatbotify-choice-row">
					{currentQuestions.map((_question, index) => (
						<button key={`remove-${index}`} className="hn-chatbotify-button secondary" type="button" onClick={() => removeQuestion(index)}>
							{`Remove Q${index + 1}`}
						</button>
					))}
				</div>
			) : null}

			{error !== "" ? <p className="hn-chatbotify-error">{error}</p> : null}

			<div className="hn-chatbotify-choice-row">
				<button className="hn-chatbotify-button" type="button" onClick={startAdd}>Add question</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={() => setStep("review")}>Review all</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={() => setStep("pick_edit")} disabled={currentQuestions.length === 0}>Edit by number</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={() => setStep("pick_remove")} disabled={currentQuestions.length === 0}>Remove</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={useDefault}>Use default</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={startBlank}>Start blank</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={props.onClose}>Done</button>
			</div>
		</div>
	);
}

export default function OwnerScreeningQuestionBuilder(props: OwnerScreeningQuestionBuilderProps) {
	const fieldName = props.fieldName ?? FIELD_NAME;
	const initialQuestions = useMemo(() => initialQuestionsFromProps(props.initialQuestions), [props.initialQuestions]);
	const draftKey = props.draftKey ?? `hn:wf1:owner-screening-draft:${fieldName}`;
	const draftStore = useOwnerAssetDraft({ draftKey, initialQuestions });
	const [showReview, setShowReview] = useState(false);
	const [agentOpen, setAgentOpen] = useState(false);
	const [agentTask, setAgentTask] = useState<AgentTask>({ type: "menu", nonce: 1 });

	const questions = draftStore.state.ownerConditionsSpec.preScreenQuestions;
	const serializedQuestions = useMemo(() => JSON.stringify(questions), [questions]);
	const changed = templateChanged(questions);
	const summary = changed
		? `${questions.length} custom screening question(s)`
		: `Default HandoverNow screening active · ${questions.length} questions`;

	function openAgent(taskType: AgentTask["type"] = "menu", index = 0): void {
		setAgentTask(
			taskType === "edit"
				? { type: "edit", index, nonce: Date.now() }
				: { type: taskType, nonce: Date.now() } as AgentTask,
		);
		setAgentOpen(true);
	}

	function closeAgent(): void {
		setAgentOpen(false);
	}

	function useDefault(): void {
		if (changed && !window.confirm("Replace the current screening questions with the default HandoverNow set?")) {
			return;
		}

		draftStore.dispatch({ type: "SCREENING_QUESTIONS_REPLACED", questions: defaultQuestions() });
		setShowReview(true);
	}

	return (
		<section className="hn-screening-builder" aria-labelledby="screening-builder-heading">
			<input type="hidden" name={fieldName} value={serializedQuestions} readOnly />

			<div>
				<p className="rental-kicker">Tenant screening</p>
				<h2 id="screening-builder-heading">Pre-screen questions</h2>
				<p className="hn-chatbotify-muted">{summary}</p>
				<p className="hn-chatbotify-muted">Browser draft revision {draftStore.state.revision}. Saved locally for reload recovery.</p>
			</div>

			<div className="hn-chatbotify-choice-row">
				<button className="hn-chatbotify-button" type="button" onClick={useDefault}>Use default</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={() => setShowReview((current) => !current)}>
					{showReview ? "Hide questions" : "Review questions"}
				</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={() => openAgent("menu")}>Chat with agent</button>
			</div>

			{showReview ? (
				<ScreeningQuestionCarousel
					questions={questions}
					onEdit={(index) => openAgent("edit", index)}
					onRemove={(index) => draftStore.dispatch({ type: "SCREENING_QUESTION_REMOVED", index })}
					onMove={(index, direction) => draftStore.dispatch({ type: "SCREENING_QUESTION_MOVED", index, direction })}
				/>
			) : null}

			<HandoverNowAgentDialog
				open={agentOpen}
				title="Screening setup"
				subtitle="Create or adjust tenant screening questions for this asset. The card always reads the latest browser draft."
				width="min(96vw, 900px)"
				height="min(92vh, 780px)"
				onClose={closeAgent}
			>
				<HandoverNowChatbotifyShell
					title="HandoverNow agent"
					message="Screening setup"
					disabledPlaceholderText="Use the setup card above"
					height="calc(min(92vh, 780px) - 126px)"
					showFooter={false}
				>
					<OwnerScreeningAgentCard
						draftStore={draftStore}
						initialTask={agentTask}
						onClose={closeAgent}
					/>
				</HandoverNowChatbotifyShell>
			</HandoverNowAgentDialog>
		</section>
	);
}
