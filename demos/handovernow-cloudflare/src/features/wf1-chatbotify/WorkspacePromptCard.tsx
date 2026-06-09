import { useMemo, useState } from "react";
import type {
	MediaUploadResult,
	SubmitState,
	Wf1Action,
	Wf1Card,
	Wf1CardType,
	Wf1Workspace,
	Wf1WorkspaceRoutes,
} from "./types";
import { answerWorkflowCard, createWorkflowCard, runWorkflowAction, uploadMedia } from "./wf1Api";
import { arrayOfObjects, objectValue, stringValue } from "./objectUtils";
import { startTrace } from "./debugTrace";

const TRACE_SCOPE = "WorkspacePromptCard";

type ChoiceOption = { value: string; label: string };

type PendingCardAnswerFormProps = {
	card: Wf1Card;
	positionLabel: string;
	routes: Wf1WorkspaceRoutes;
	onChanged: () => Promise<void>;
};

type AvailableActionsCardProps = {
	workflowInstanceId: string;
	actions: Wf1Action[];
	routes: Wf1WorkspaceRoutes;
	onChanged: () => Promise<void>;
};

type CreateCardFormProps = {
	workflowInstanceId: string;
	cardTypes: Wf1CardType[];
	routes: Wf1WorkspaceRoutes;
	onChanged: () => Promise<void>;
};

type WorkspacePromptCardProps = {
	workspace: Wf1Workspace;
	workflowInstanceId: string;
	routes: Wf1WorkspaceRoutes;
	onChanged: () => Promise<void>;
};

function initialSubmitState(): SubmitState { return { busy: false, error: "", success: "" }; }
function submitStateBusy(): SubmitState { return { busy: true, error: "", success: "" }; }
function submitStateWithError(error: string): SubmitState { return { busy: false, error, success: "" }; }
function submitStateWithSuccess(success: string): SubmitState { return { busy: false, error: "", success }; }

function projectionFromWorkspace(workspace: Wf1Workspace): Record<string, unknown> { return objectValue(workspace.projection); }
function taskBucketsFromWorkspace(workspace: Wf1Workspace): Record<string, unknown> { return objectValue(projectionFromWorkspace(workspace).taskBuckets); }
function myOpenTasksFromWorkspace(workspace: Wf1Workspace): Wf1Card[] { return arrayOfObjects(taskBucketsFromWorkspace(workspace).myOpenTasks); }
function availableActionsFromWorkspace(workspace: Wf1Workspace): Wf1Action[] { return arrayOfObjects(projectionFromWorkspace(workspace).availableActions); }
function availableCardTypesFromWorkspace(workspace: Wf1Workspace): Wf1CardType[] { return arrayOfObjects(projectionFromWorkspace(workspace).availableCardTypes); }
function waitingMessageFromWorkspace(workspace: Wf1Workspace): string { return stringValue(projectionFromWorkspace(workspace).waitingMessage, "No action needed right now."); }
function primaryNextStepFromWorkspace(workspace: Wf1Workspace): string { return stringValue(projectionFromWorkspace(workspace).primaryNextStep, waitingMessageFromWorkspace(workspace)); }

function cardIdFor(card: Wf1Card): string { return stringValue(card.id).trim(); }
function promptForCard(card: Wf1Card): string { return stringValue(card.prompt, stringValue(card.card_type, "Task")); }
function answerSchemaForCard(card: Wf1Card): Record<string, unknown> { return objectValue(card.answer_schema ?? card.answerSchema); }
function evidencePolicyForCard(card: Wf1Card): Record<string, unknown> { return objectValue(card.evidence_policy ?? card.evidencePolicy); }
function cardSpecFor(cardOrType: Wf1Card | Wf1CardType): Record<string, unknown> { return objectValue(cardOrType.card_spec ?? cardOrType.cardSpec ?? cardOrType.defaultCardSpec); }
function answerKindForCard(card: Wf1Card): string { return stringValue(answerSchemaForCard(card).kind, "free_text"); }

function choiceOptionFromUnknown(value: unknown): ChoiceOption | null {
	const row = objectValue(value);
	const optionValue = stringValue(row.value).trim();
	const optionLabel = stringValue(row.label, optionValue).trim();
	return optionValue === "" ? null : { value: optionValue, label: optionLabel === "" ? optionValue : optionLabel };
}

function choiceOptionsFromSchema(schema: Record<string, unknown>): ChoiceOption[] {
	const rawOptions = Array.isArray(schema.options) ? schema.options : [];
	const options: ChoiceOption[] = [];
	for (const rawOption of rawOptions) {
		const option = choiceOptionFromUnknown(rawOption);
		if (option !== null) options.push(option);
	}
	return options;
}

function defaultYesNoOptions(): ChoiceOption[] { return [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]; }

function mergeSchemaValuesWithSpecLabels(schemaOptions: ChoiceOption[], specOptions: ChoiceOption[]): ChoiceOption[] {
	if (schemaOptions.length === 0 && specOptions.length === 0) return defaultYesNoOptions();
	if (schemaOptions.length === 0) return specOptions;
	if (specOptions.length === 0) return schemaOptions;
	const specLabelByValue = new Map<string, string>();
	for (const option of specOptions) specLabelByValue.set(option.value, option.label);
	return schemaOptions.map((option) => ({ value: option.value, label: specLabelByValue.get(option.value) ?? option.label }));
}

function choiceOptionsForCard(card: Wf1Card): ChoiceOption[] {
	return mergeSchemaValuesWithSpecLabels(choiceOptionsFromSchema(answerSchemaForCard(card)), choiceOptionsFromSchema(cardSpecFor(card)));
}

function agreementOptionsForCard(_card: Wf1Card): ChoiceOption[] { return defaultYesNoOptions(); }
function evidenceAttachmentModeForCard(card: Wf1Card): string { return stringValue(evidencePolicyForCard(card).attachment, "forbidden"); }
function cardAcceptsEvidence(card: Wf1Card): boolean { return evidenceAttachmentModeForCard(card) !== "forbidden"; }
function cardRequiresEvidence(card: Wf1Card): boolean { return evidenceAttachmentModeForCard(card) === "required"; }

function actionIdFor(action: Wf1Action): string { return stringValue(action.id).trim(); }
function labelForAction(action: Wf1Action): string { const fallback = actionIdFor(action); return stringValue(action.label, fallback === "" ? "Run action" : fallback); }
function actionIsBlocked(action: Wf1Action): boolean { return action.blocked === true; }
function warningsForAction(action: Wf1Action): string[] { return Array.isArray(action.warnings) ? action.warnings.map((warning) => stringValue(warning).trim()).filter(Boolean) : []; }

function cardTypeIdFor(cardType: Wf1CardType): string { return stringValue(cardType.id).trim(); }
function labelForCardType(cardType: Wf1CardType): string { const id = cardTypeIdFor(cardType); return stringValue(cardType.label, id); }
function answerSchemaForCardType(cardType: Wf1CardType): Record<string, unknown> { return objectValue(cardType.answerSchema ?? cardType.answer_schema); }
function answerKindForCardType(cardType: Wf1CardType): string { return stringValue(answerSchemaForCardType(cardType).kind); }
function evidencePolicyForCardType(cardType: Wf1CardType): Record<string, unknown> { return objectValue(cardType.evidencePolicy ?? cardType.evidence_policy); }

function cardTypeIsCustomMcqTask(cardType: Wf1CardType): boolean {
	const id = cardTypeIdFor(cardType);
	const kind = answerKindForCardType(cardType);
	return id === "mcq_single" || id === "mcq_single_required_evidence" || id === "mcq_multi" || id === "mcq_multi_required_evidence" || kind === "mcq_single" || kind === "mcq_multi";
}

function cardTypeRequiresEvidence(cardType: Wf1CardType): boolean {
	const id = cardTypeIdFor(cardType);
	return stringValue(evidencePolicyForCardType(cardType).attachment) === "required" || id.includes("required_evidence");
}

function defaultComposerOptions(cardType: Wf1CardType): ChoiceOption[] {
	return mergeSchemaValuesWithSpecLabels(choiceOptionsFromSchema(answerSchemaForCardType(cardType)), choiceOptionsFromSchema(cardSpecFor(cardType)));
}

function answerFromFormState(kind: string, answerText: string, selectedValue: string, selectedValues: string[], amountText: string): Record<string, unknown> {
	if (kind === "none") return {};
	if (kind === "amount_proof") return { amount: Number(amountText), reference: answerText.trim() };
	if (kind === "mcq_single" || kind === "yes_no" || kind === "agreement_review") return { value: selectedValue };
	if (kind === "mcq_multi") return { values: selectedValues };
	if (kind === "document_upload" || kind === "signed_document_upload") return { documentReference: answerText.trim() };
	return { text: answerText.trim() };
}

function cleanAnswer(answer: Record<string, unknown>): Record<string, unknown> {
	const cleaned: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(answer)) {
		if (value === undefined) continue;
		if (typeof value === "number" && !Number.isFinite(value)) continue;
		if (typeof value === "string" && value.trim() === "") continue;
		if (Array.isArray(value) && value.length === 0) continue;
		cleaned[key] = value;
	}
	return cleaned;
}

function validationErrorForPendingCardAnswer(card: Wf1Card, kind: string, answerText: string, amountText: string, selectedValue: string, selectedValues: string[], file: File | null): string {
	if (cardRequiresEvidence(card) && file === null) return "Evidence file is required.";
	if (kind === "none") return "";
	if (kind === "amount_proof") {
		const amount = Number(amountText);
		if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount.";
		if (answerText.trim() === "") return "Enter payment reference.";
		return "";
	}
	if (kind === "mcq_single" || kind === "yes_no" || kind === "agreement_review") return selectedValue.trim() === "" ? "Choose an option." : "";
	if (kind === "mcq_multi") return selectedValues.length === 0 ? "Choose at least one option." : "";
	if (kind === "document_upload" || kind === "signed_document_upload") return answerText.trim() === "" ? "Enter document reference." : "";
	return answerText.trim() === "" ? "Write an answer." : "";
}

function PendingCardAnswerForm(props: PendingCardAnswerFormProps) {
	const card = props.card;
	const kind = answerKindForCard(card);
	const options = kind === "agreement_review" ? agreementOptionsForCard(card) : choiceOptionsForCard(card);
	const [answerText, setAnswerText] = useState("");
	const [amountText, setAmountText] = useState("");
	const [selectedValue, setSelectedValue] = useState(options[0]?.value ?? "yes");
	const [selectedValues, setSelectedValues] = useState<string[]>([]);
	const [file, setFile] = useState<File | null>(null);
	const [submitState, setSubmitState] = useState<SubmitState>(initialSubmitState);

	function toggleMultiValue(value: string): void {
		setSelectedValues((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
	}

	async function uploadSelectedFileIfPresent(): Promise<MediaUploadResult[]> {
		if (file === null) return [];
		const uploadResult = await uploadMedia(file, props.routes.mediaUpload);
		if (!uploadResult.ok) throw new Error(uploadResult.error);
		return [uploadResult.payload];
	}

	async function submitAnswer(): Promise<void> {
		const trace = startTrace(TRACE_SCOPE, "PendingCardAnswerForm.submitAnswer", { cardId: cardIdFor(card), kind });
		const validationError = validationErrorForPendingCardAnswer(card, kind, answerText, amountText, selectedValue, selectedValues, file);
		if (validationError !== "") { setSubmitState(submitStateWithError(validationError)); trace.end({ submitted: false, validationError }); return; }
		setSubmitState(submitStateBusy());
		let uploadedAttachments: MediaUploadResult[];
		try { uploadedAttachments = await uploadSelectedFileIfPresent(); } catch (error) { const message = error instanceof Error ? error.message : "Media upload failed."; setSubmitState(submitStateWithError(message)); trace.fail(error, { stage: "media upload", message }); return; }
		const answer = cleanAnswer(answerFromFormState(kind, answerText, selectedValue, selectedValues, amountText));
		const cardId = cardIdFor(card);
		if (cardId === "") { setSubmitState(submitStateWithError("Card id missing.")); trace.end({ submitted: false, stage: "card id" }); return; }
		const result = await answerWorkflowCard(props.routes, { cardId, answer, attachments: uploadedAttachments });
		if (!result.ok) { setSubmitState(submitStateWithError(result.error)); trace.end({ submitted: false, error: result.error }); return; }
		setSubmitState(submitStateWithSuccess("Saved."));
		await props.onChanged();
		trace.end({ submitted: true });
	}

	return (
		<div className="hn-workspace-card">
			<p className="hn-chatbotify-muted">{props.positionLabel}</p>
			<h3>{promptForCard(card)}</h3>
			{kind === "none" ? <p className="hn-chatbotify-muted">No written answer is required. Click Acknowledge to continue.</p> : null}
			{kind === "amount_proof" ? <><label className="hn-chatbotify-field"><span>Amount</span><input type="number" value={amountText} onChange={(event) => setAmountText(event.currentTarget.value)} placeholder="Amount" /></label><label className="hn-chatbotify-field"><span>Reference</span><input value={answerText} onChange={(event) => setAnswerText(event.currentTarget.value)} placeholder="Payment reference" /></label></> : null}
			{kind === "mcq_single" || kind === "yes_no" || kind === "agreement_review" ? <label className="hn-chatbotify-field"><span>Choice</span><select value={selectedValue} onChange={(event) => setSelectedValue(event.currentTarget.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
			{kind === "mcq_multi" ? <fieldset className="hn-chatbotify-choice-set"><legend>Choices</legend>{options.map((option) => <label key={option.value}><input type="checkbox" checked={selectedValues.includes(option.value)} onChange={() => toggleMultiValue(option.value)} /><span>{option.label}</span></label>)}</fieldset> : null}
			{kind === "document_upload" || kind === "signed_document_upload" ? <label className="hn-chatbotify-field"><span>Document reference</span><input value={answerText} onChange={(event) => setAnswerText(event.currentTarget.value)} placeholder="Document reference" /></label> : null}
			{kind !== "none" && kind !== "amount_proof" && kind !== "mcq_single" && kind !== "yes_no" && kind !== "agreement_review" && kind !== "mcq_multi" && kind !== "document_upload" && kind !== "signed_document_upload" ? <label className="hn-chatbotify-field"><span>Answer</span><textarea value={answerText} onChange={(event) => setAnswerText(event.currentTarget.value)} placeholder="Write your answer" /></label> : null}
			{cardAcceptsEvidence(card) ? <label className="hn-chatbotify-field"><span>{cardRequiresEvidence(card) ? "Required evidence image/PDF" : "Optional evidence image/PDF"}</span><input type="file" accept="image/*,application/pdf" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} /></label> : null}
			<button className="hn-chatbotify-button" type="button" disabled={submitState.busy} onClick={submitAnswer}>{submitState.busy ? "Saving..." : kind === "none" ? "Acknowledge" : "Answer"}</button>
			{submitState.error !== "" ? <p className="hn-chatbotify-error">{submitState.error}</p> : null}
			{submitState.success !== "" ? <p className="hn-chatbotify-success">{submitState.success}</p> : null}
		</div>
	);
}

function AvailableActionsCard(props: AvailableActionsCardProps) {
	const [submitState, setSubmitState] = useState<SubmitState>(initialSubmitState);
	async function runAction(action: Wf1Action): Promise<void> {
		const actionId = actionIdFor(action);
		if (actionId === "") { setSubmitState(submitStateWithError("Action id missing.")); return; }
		setSubmitState(submitStateBusy());
		const result = await runWorkflowAction(props.routes, props.workflowInstanceId, actionId);
		if (!result.ok) { setSubmitState(submitStateWithError(result.error)); return; }
		setSubmitState(submitStateWithSuccess("Action completed."));
		await props.onChanged();
	}
	return <div className="hn-workspace-card"><h3>Available actions</h3>{props.actions.map((action, index) => <div className="hn-action-row" key={`${actionIdFor(action)}-${index}`}>{warningsForAction(action).map((warning) => <p className="hn-chatbotify-muted" key={warning}>{warning}</p>)}<button className="hn-chatbotify-button" type="button" disabled={actionIsBlocked(action) || submitState.busy} onClick={() => runAction(action)}>{labelForAction(action)}</button></div>)}{submitState.error !== "" ? <p className="hn-chatbotify-error">{submitState.error}</p> : null}{submitState.success !== "" ? <p className="hn-chatbotify-success">{submitState.success}</p> : null}</div>;
}

function firstCardTypeOrEmpty(cardTypes: Wf1CardType[]): Wf1CardType { return cardTypes[0] ?? {}; }
function selectedCardTypeFromList(cardTypes: Wf1CardType[], selectedCardTypeId: string): Wf1CardType { return cardTypes.find((cardType) => cardTypeIdFor(cardType) === selectedCardTypeId) ?? firstCardTypeOrEmpty(cardTypes); }
function cardSpecForCreateCard(customMcq: boolean, defaultOptions: ChoiceOption[], optionOne: string, optionTwo: string): Record<string, unknown> {
	if (!customMcq) return {};
	return { options: [{ value: defaultOptions[0]?.value ?? "yes", label: optionOne.trim() || "Yes" }, { value: defaultOptions[1]?.value ?? "no", label: optionTwo.trim() || "No" }] };
}
function validationErrorForCreateCard(cardTypeId: string, prompt: string): string { if (cardTypeId === "") return "Choose task type."; if (prompt.trim() === "") return "Write the task question."; return ""; }

function CreateCardForm(props: CreateCardFormProps) {
	const firstCardType = firstCardTypeOrEmpty(props.cardTypes);
	const firstDefaultOptions = defaultComposerOptions(firstCardType);
	const [cardTypeId, setCardTypeId] = useState(cardTypeIdFor(firstCardType));
	const [prompt, setPrompt] = useState("");
	const [optionOne, setOptionOne] = useState(firstDefaultOptions[0]?.label ?? "Yes");
	const [optionTwo, setOptionTwo] = useState(firstDefaultOptions[1]?.label ?? "No");
	const [submitState, setSubmitState] = useState<SubmitState>(initialSubmitState);
	const selectedCardType = selectedCardTypeFromList(props.cardTypes, cardTypeId);
	const customMcq = cardTypeIsCustomMcqTask(selectedCardType);
	const evidenceRequired = cardTypeRequiresEvidence(selectedCardType);
	const defaultOptions = defaultComposerOptions(selectedCardType);
	function handleCardTypeChange(value: string): void { setCardTypeId(value); const options = defaultComposerOptions(selectedCardTypeFromList(props.cardTypes, value)); setOptionOne(options[0]?.label ?? "Yes"); setOptionTwo(options[1]?.label ?? "No"); }
	async function submitCard(): Promise<void> {
		const validationError = validationErrorForCreateCard(cardTypeId, prompt);
		if (validationError !== "") { setSubmitState(submitStateWithError(validationError)); return; }
		setSubmitState(submitStateBusy());
		const result = await createWorkflowCard(props.routes, { workflowInstanceId: props.workflowInstanceId, cardType: cardTypeId, prompt: prompt.trim(), cardSpec: cardSpecForCreateCard(customMcq, defaultOptions, optionOne, optionTwo) });
		if (!result.ok) { setSubmitState(submitStateWithError(result.error)); return; }
		setPrompt(""); setSubmitState(submitStateWithSuccess("Task created.")); await props.onChanged();
	}
	return <div className="hn-workspace-card"><h3>Create task</h3><label className="hn-chatbotify-field"><span>Task type</span><select value={cardTypeId} onChange={(event) => handleCardTypeChange(event.currentTarget.value)}>{props.cardTypes.map((cardType) => { const id = cardTypeIdFor(cardType); return <option key={id} value={id}>{labelForCardType(cardType)}</option>; })}</select></label><label className="hn-chatbotify-field"><span>Question / instruction</span><textarea value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} placeholder="Write the task clearly" /></label>{customMcq ? <div className="hn-option-editor"><label className="hn-chatbotify-field"><span>Option 1</span><input value={optionOne} onChange={(event) => setOptionOne(event.currentTarget.value)} /></label><label className="hn-chatbotify-field"><span>Option 2</span><input value={optionTwo} onChange={(event) => setOptionTwo(event.currentTarget.value)} /></label></div> : null}{evidenceRequired ? <p className="hn-chatbotify-muted">This task blocks the next stage until the other side answers and attaches image/PDF evidence.</p> : null}<button className="hn-chatbotify-button" type="button" disabled={submitState.busy} onClick={submitCard}>{submitState.busy ? "Creating..." : "Create task"}</button>{submitState.error !== "" ? <p className="hn-chatbotify-error">{submitState.error}</p> : null}{submitState.success !== "" ? <p className="hn-chatbotify-success">{submitState.success}</p> : null}</div>;
}

function unblockedActions(actions: Wf1Action[]): Wf1Action[] { return actions.filter((action) => !actionIsBlocked(action)); }

export default function WorkspacePromptCard(props: WorkspacePromptCardProps) {
	const workspace = props.workspace;
	const myOpenTasks = useMemo(() => myOpenTasksFromWorkspace(workspace), [workspace]);
	const availableActions = useMemo(() => availableActionsFromWorkspace(workspace), [workspace]);
	const availableCardTypes = useMemo(() => availableCardTypesFromWorkspace(workspace), [workspace]);
	const primaryNextStep = primaryNextStepFromWorkspace(workspace);
	const waitingMessage = waitingMessageFromWorkspace(workspace);
	const runnableActions = unblockedActions(availableActions);
	const hasNoCurrentWork = myOpenTasks.length === 0 && runnableActions.length === 0 && availableCardTypes.length === 0;
	return <div className="hn-workspace-stack"><p className="hn-chatbotify-note">{primaryNextStep}</p>{myOpenTasks.length > 0 ? <div className="hn-workspace-stack">{myOpenTasks.map((card, index) => <PendingCardAnswerForm key={cardIdFor(card) || `card-${index}`} card={card} positionLabel={`Open task ${index + 1} of ${myOpenTasks.length}`} routes={props.routes} onChanged={props.onChanged} />)}</div> : null}{runnableActions.length > 0 ? <AvailableActionsCard workflowInstanceId={props.workflowInstanceId} actions={runnableActions} routes={props.routes} onChanged={props.onChanged} /> : null}{availableCardTypes.length > 0 ? <CreateCardForm workflowInstanceId={props.workflowInstanceId} cardTypes={availableCardTypes} routes={props.routes} onChanged={props.onChanged} /> : null}{hasNoCurrentWork ? <div className="hn-workspace-card"><h3>No action needed now</h3><p>{waitingMessage}</p></div> : null}</div>;
}
