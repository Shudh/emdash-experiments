import { useMemo, useRef, useState } from "react";
import type { PrescreenQuestion, PrescreenQuestionKind } from "./types";
import HandoverNowChatbotifyShell from "./HandoverNowChatbotifyShell";
import "./wf1-chatbotify.css";

type OwnerScreeningQuestionBuilderProps = {
	fieldName?: string;
	initialQuestions?: PrescreenQuestion[];
};

type AgentStep = "menu" | "review" | "add" | "pick_edit" | "edit" | "pick_remove";

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

const panelStyle = {
	display: "grid",
	gap: "10px",
	gridColumn: "1 / -1",
	border: "1px solid var(--r-border, rgba(15,23,42,.14))",
	borderRadius: "16px",
	padding: "14px",
	background: "var(--r-panel, #fff)",
} as const;

const rowStyle = {
	display: "flex",
	flexWrap: "wrap",
	gap: "8px",
	alignItems: "center",
} as const;

const mutedStyle = {
	margin: 0,
	color: "var(--r-muted, #64748b)",
	fontSize: ".92rem",
	lineHeight: 1.45,
} as const;

const dialogStyle = {
	width: "min(94vw, 420px)",
	border: "0",
	borderRadius: "22px",
	padding: "0",
	background: "transparent",
} as const;

const dialogShellStyle = {
	display: "grid",
	gap: "12px",
	padding: "14px",
	borderRadius: "22px",
	background: "var(--r-panel, #fff)",
	boxShadow: "0 24px 70px rgba(15,23,42,.28)",
} as const;

const dialogHeaderStyle = {
	display: "flex",
	alignItems: "start",
	justifyContent: "space-between",
	gap: "12px",
} as const;

const carouselStyle = {
	display: "grid",
	gridAutoFlow: "column",
	gridAutoColumns: "minmax(220px, 280px)",
	gap: "10px",
	overflowX: "auto",
	paddingBottom: "8px",
	scrollSnapType: "x proximity",
} as const;

const carouselCardStyle = {
	display: "grid",
	gap: "8px",
	scrollSnapAlign: "start",
	border: "1px solid var(--r-border, rgba(15,23,42,.14))",
	borderRadius: "14px",
	padding: "12px",
	background: "var(--r-panel-soft, #f8fafc)",
	minHeight: "145px",
} as const;

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

	if (label === "") {
		return null;
	}

	const key = existingKey ?? keyFromLabel(label, existingKeys);
	const target = draft.target.trim() === "" ? key : draft.target;

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

function moveQuestion(questions: PrescreenQuestion[], index: number, direction: -1 | 1): PrescreenQuestion[] {
	const nextIndex = index + direction;

	if (nextIndex < 0 || nextIndex >= questions.length) {
		return questions;
	}

	const copy = [...questions];
	const current = copy[index];
	const next = copy[nextIndex];

	if (!current || !next) {
		return questions;
	}

	copy[index] = next;
	copy[nextIndex] = current;
	return copy;
}

function QuestionCarousel(props: {
	questions: PrescreenQuestion[];
	onEdit: (index: number) => void;
	onRemove: (index: number) => void;
	onMove: (index: number, direction: -1 | 1) => void;
}) {
	return (
		<div style={carouselStyle}>
			{props.questions.map((question, index) => (
				<article key={question.key} style={carouselCardStyle}>
					<div style={{ ...rowStyle, justifyContent: "space-between" }}>
						<strong>{`Q${index + 1}`}</strong>
						<span style={{ color: "var(--r-muted, #64748b)", fontSize: ".82rem", fontWeight: 800 }}>
							{questionKindLabel(question.kind)}
						</span>
					</div>
					<p style={{ margin: 0, fontWeight: 750, lineHeight: 1.35 }}>{question.label}</p>
					<p style={mutedStyle}>{question.required ? "Required" : "Optional"}</p>
					<div style={{ ...rowStyle, marginTop: "auto" }}>
						<button className="hn-chatbotify-button secondary" type="button" onClick={() => props.onEdit(index)}>Edit</button>
						<button className="hn-chatbotify-button secondary" type="button" onClick={() => props.onRemove(index)}>Delete</button>
						<button className="hn-chatbotify-button secondary" type="button" onClick={() => props.onMove(index, -1)}>←</button>
						<button className="hn-chatbotify-button secondary" type="button" onClick={() => props.onMove(index, 1)}>→</button>
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
	questions: PrescreenQuestion[];
	onQuestionsChange: (questions: PrescreenQuestion[]) => void;
	onClose: () => void;
}) {
	const [step, setStep] = useState<AgentStep>("menu");
	const [draft, setDraft] = useState<QuestionDraft>(() => emptyDraft());
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [error, setError] = useState("");

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
		const question = props.questions[index];

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
		const question = props.questions[index];

		if (!question) {
			setError("That question number does not exist.");
			return;
		}

		props.onQuestionsChange(props.questions.filter((_item, currentIndex) => currentIndex !== index));
		resetDraft();
		setStep("menu");
	}

	function saveDraft(): void {
		const existingKeys = new Set(props.questions.map((question) => question.key));
		const existingKey = selectedIndex === null ? undefined : props.questions[selectedIndex]?.key;
		const question = questionFromDraft(draft, existingKeys, existingKey);

		if (question === null) {
			setError("Write the question first.");
			return;
		}

		if (selectedIndex === null) {
			props.onQuestionsChange([...props.questions, question]);
		} else {
			props.onQuestionsChange(props.questions.map((item, index) => (index === selectedIndex ? question : item)));
		}

		resetDraft();
		setStep("menu");
	}

	function useDefault(): void {
		props.onQuestionsChange(DEFAULT_QUESTIONS.map(normalizeQuestion));
		resetDraft();
		setStep("menu");
	}

	function startBlank(): void {
		props.onQuestionsChange([]);
		resetDraft();
		setStep("menu");
	}

	function moveQuestionAt(index: number, direction: -1 | 1): void {
		props.onQuestionsChange(moveQuestion(props.questions, index, direction));
	}

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
						? "Here are the screening questions. You can edit, delete, or reorder them."
						: step === "pick_edit"
							? "Which question number should I edit?"
							: step === "pick_remove"
								? "Which question number should I remove?"
								: `I can use the default screening, add a question, edit by number, remove by number, or start blank. Current set: ${props.questions.length} question(s).`}
				</div>
			</div>

			{step === "review" ? (
				<QuestionCarousel
					questions={props.questions}
					onEdit={startEdit}
					onRemove={removeQuestion}
					onMove={moveQuestionAt}
				/>
			) : null}

			{step === "pick_edit" ? (
				<div className="hn-chatbotify-choice-row">
					{props.questions.map((_question, index) => (
						<button key={`edit-${index}`} className="hn-chatbotify-button secondary" type="button" onClick={() => startEdit(index)}>
							{`Q${index + 1}`}
						</button>
					))}
				</div>
			) : null}

			{step === "pick_remove" ? (
				<div className="hn-chatbotify-choice-row">
					{props.questions.map((_question, index) => (
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
				<button className="hn-chatbotify-button secondary" type="button" onClick={() => setStep("pick_edit")} disabled={props.questions.length === 0}>Edit by number</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={() => setStep("pick_remove")} disabled={props.questions.length === 0}>Remove</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={useDefault}>Use default</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={startBlank}>Start blank</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={props.onClose}>Done</button>
			</div>
		</div>
	);
}

export default function OwnerScreeningQuestionBuilder(props: OwnerScreeningQuestionBuilderProps) {
	const fieldName = props.fieldName ?? FIELD_NAME;
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const [questions, setQuestions] = useState<PrescreenQuestion[]>(() => initialQuestionsFromProps(props.initialQuestions));
	const [showReview, setShowReview] = useState(false);

	const serializedQuestions = useMemo(() => JSON.stringify(questions), [questions]);
	const changed = templateChanged(questions);
	const summary = changed
		? `${questions.length} custom screening question(s)`
		: `Default HandoverNow screening active · ${questions.length} questions`;

	function openAgent(): void {
		dialogRef.current?.showModal();
	}

	function closeAgent(): void {
		dialogRef.current?.close();
	}

	function useDefault(): void {
		setQuestions(DEFAULT_QUESTIONS.map(normalizeQuestion));
		setShowReview(false);
	}

	return (
		<section style={panelStyle} aria-labelledby="screening-builder-heading">
			<input type="hidden" name={fieldName} value={serializedQuestions} readOnly />

			<div>
				<p className="rental-kicker">Tenant screening</p>
				<h2 id="screening-builder-heading" style={{ margin: 0 }}>Pre-screen questions</h2>
				<p style={mutedStyle}>{summary}</p>
			</div>

			<div style={rowStyle}>
				<button className="hn-chatbotify-button" type="button" onClick={useDefault}>Use default</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={() => setShowReview((current) => !current)}>
					{showReview ? "Hide questions" : "Review questions"}
				</button>
				<button className="hn-chatbotify-button secondary" type="button" onClick={openAgent}>Chat with agent</button>
			</div>

			{showReview ? (
				<QuestionCarousel
					questions={questions}
					onEdit={(index) => {
						openAgent();
						window.setTimeout(() => {
							console.info("[wf1] Open agent and choose Edit by number", index + 1);
						}, 0);
					}}
					onRemove={(index) => setQuestions((current) => current.filter((_item, currentIndex) => currentIndex !== index))}
					onMove={(index, direction) => setQuestions((current) => moveQuestion(current, index, direction))}
				/>
			) : null}

			<dialog ref={dialogRef} style={dialogStyle}>
				<div style={dialogShellStyle}>
					<div style={dialogHeaderStyle}>
						<div>
							<p className="rental-kicker">HandoverNow agent</p>
							<h2 style={{ margin: 0 }}>Screening setup</h2>
							<p style={mutedStyle}>Create or adjust tenant screening questions for this asset.</p>
						</div>
						<button className="hn-chatbotify-button secondary" type="button" onClick={closeAgent}>Close</button>
					</div>

					<HandoverNowChatbotifyShell
						title="HandoverNow agent"
						message="Screening setup"
						disabledPlaceholderText="Use the setup card above"
						height="640px"
					>
						<OwnerScreeningAgentCard
							questions={questions}
							onQuestionsChange={setQuestions}
							onClose={closeAgent}
						/>
					</HandoverNowChatbotifyShell>
				</div>
			</dialog>
		</section>
	);
}