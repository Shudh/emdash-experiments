export type JsonObject = Record<string, unknown>;

export type PrescreenQuestionKind =
	| "text"
	| "textarea"
	| "phone"
	| "email"
	| "date"
	| "number"
	| "single_choice";

export type PrescreenQuestion = {
	key: string;
	label: string;
	kind: PrescreenQuestionKind;
	required: boolean;
	options?: string[];
	target: string;
	placeholder: string;
};

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
	answerHash?: string;
	signature?: string;
};

export type PrescreenConfig = {
	assetId: string;
	assetTitle: string;
	action: string;
	loginHref: string;
	canSubmit: boolean;
	questions: PrescreenQuestion[];
	acceptedConditionsVersion: number;
	acceptedConditionsHash: string;
	humanCheckChallenge: HumanCheckChallenge;
	turnstileSiteKey: string;
	storageKey: string;
};

export type PrescreenAnswer = {
	key: string;
	label: string;
	answer: string;
	target: string;
};

export type PrescreenState = {
	startedAt: string;
	index: number;
	answers: Record<string, string>;
	humanCheckAnswer: string;
	turnstileToken: string;
	challengeNonce: string;
};

export type MediaUploadResult = {
	mediaId: string;
	storageKey: string;
	mimeType: string;
	filename: string;
	url: string;
};

export type Wf1WorkspaceRoutes = {
	workspace: string;
	workflowActions: string;
	workflowCards: string;
	workflowCardAnswerBase: string;
	mediaUpload: string;
};

export type Wf1Workspace = JsonObject;
export type Wf1Card = JsonObject;
export type Wf1Action = JsonObject;
export type Wf1CardType = JsonObject;

export type SubmitState = {
	busy: boolean;
	error: string;
	success: string;
};
