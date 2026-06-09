import { useCallback, useEffect, useMemo, useState } from "react";
import ChatBot, { type Flow, type Settings, type Styles } from "react-chatbotify";
import type { SubmitState, Wf1Workspace, Wf1WorkspaceRoutes } from "./types";
import { loadWorkspace } from "./wf1Api";
import { objectValue, stringValue } from "./objectUtils";
import WorkspacePromptCard from "./WorkspacePromptCard";
import { startTrace } from "./debugTrace";
import "./wf1-chatbotify.css";

const TRACE_SCOPE = "Wf1WorkspaceChatbotifyApp";

type Wf1WorkspaceChatbotifyAppProps = {
	workflowInstanceId: string;
	routes: Wf1WorkspaceRoutes;
};

type WorkspaceLoadState = {
	workspace: Wf1Workspace | null;
	revision: number;
	submitState: SubmitState;
};

function initialSubmitState(): SubmitState { return { busy: false, error: "", success: "" }; }
function submitStateBusy(message: string): SubmitState { return { busy: true, error: "", success: message }; }
function submitStateWithError(error: string): SubmitState { return { busy: false, error, success: "" }; }
function submitStateWithSuccess(success: string): SubmitState { return { busy: false, error: "", success }; }
function initialWorkspaceLoadState(): WorkspaceLoadState { return { workspace: null, revision: 0, submitState: initialSubmitState() }; }

function workspaceTitle(workspace: Wf1Workspace | null, workflowInstanceId: string): string {
	if (workspace === null) return `Workflow ${workflowInstanceId}`;
	const workspaceRecord = objectValue(workspace);
	const asset = objectValue(workspaceRecord.asset);
	const title = stringValue(asset.title).trim();
	if (title !== "") return title;
	const summary = objectValue(workspaceRecord.summary);
	const summaryTitle = stringValue(summary.title).trim();
	return summaryTitle !== "" ? summaryTitle : `Workflow ${workflowInstanceId}`;
}

function createWorkspaceFlow(workspace: Wf1Workspace, workflowInstanceId: string, routes: Wf1WorkspaceRoutes, onChanged: () => Promise<void>): Flow {
	return {
		start: {
			message: "Workspace",
			component: <WorkspacePromptCard workspace={workspace} workflowInstanceId={workflowInstanceId} routes={routes} onChanged={onChanged} />,
			chatDisabled: true,
		},
	};
}

function createWorkspaceSettings(title: string): Settings {
	return {
		general: { embedded: true, showFooter: false },
		chatHistory: { disabled: true },
		voice: { disabled: true },
		audio: { disabled: true },
		notification: { disabled: true },
		tooltip: { mode: "NEVER" },
		chatInput: { disabledPlaceholderText: "Use the workspace card above", enabledPlaceholderText: "Type your response", blockSpam: true },
		header: { title, showAvatar: false },
		fileAttachment: { disabled: true },
		emoji: { disabled: true },
	};
}

function createWorkspaceStyles(): Styles {
	return {
		chatWindowStyle: { width: "100%", height: "720px", borderRadius: "18px", boxShadow: "none" },
		headerStyle: { borderTopLeftRadius: "18px", borderTopRightRadius: "18px" },
		bodyStyle: { padding: "12px" },
		botBubbleStyle: { maxWidth: "96%" },
		userBubbleStyle: { maxWidth: "96%" },
	};
}

function workspaceLoadedState(workspace: Wf1Workspace, currentRevision: number): WorkspaceLoadState {
	return { workspace, revision: currentRevision + 1, submitState: submitStateWithSuccess("Workspace loaded.") };
}
function workspaceLoadingState(current: WorkspaceLoadState): WorkspaceLoadState {
	return { workspace: current.workspace, revision: current.revision, submitState: submitStateBusy(current.workspace === null ? "Loading workspace..." : "Refreshing workspace...") };
}
function workspaceLoadErrorState(current: WorkspaceLoadState, error: string): WorkspaceLoadState {
	return { workspace: current.workspace, revision: current.revision, submitState: submitStateWithError(error) };
}

export default function Wf1WorkspaceChatbotifyApp(props: Wf1WorkspaceChatbotifyAppProps) {
	const workflowInstanceId = props.workflowInstanceId;
	const routes = props.routes;
	const [loadState, setLoadState] = useState<WorkspaceLoadState>(initialWorkspaceLoadState);

	const reloadWorkspace = useCallback(async (): Promise<void> => {
		const trace = startTrace(TRACE_SCOPE, "reloadWorkspace", { workflowInstanceId, workspaceRoute: routes.workspace });
		setLoadState((current) => workspaceLoadingState(current));
		const result = await loadWorkspace(routes);
		if (!result.ok) { setLoadState((current) => workspaceLoadErrorState(current, result.error)); trace.end({ loaded: false, error: result.error }); return; }
		setLoadState((current) => workspaceLoadedState(result.payload, current.revision));
		trace.end({ loaded: true, workspaceKeys: Object.keys(result.payload) });
	}, [routes, workflowInstanceId]);

	useEffect(() => { void reloadWorkspace(); }, [reloadWorkspace]);

	const title = workspaceTitle(loadState.workspace, workflowInstanceId);
	const settings = useMemo(() => createWorkspaceSettings(title), [title]);
	const styles = useMemo(() => createWorkspaceStyles(), []);
	const flow = useMemo(() => {
		if (loadState.workspace === null) {
			return { start: { message: "Loading workspace...", component: <div className="hn-workspace-card"><h3>Loading workspace</h3><p className="hn-chatbotify-muted">Fetching the latest workflow state.</p></div>, chatDisabled: true } };
		}
		return createWorkspaceFlow(loadState.workspace, workflowInstanceId, routes, reloadWorkspace);
	}, [loadState.workspace, loadState.revision, reloadWorkspace, routes, workflowInstanceId]);
	const chatBotKey = `wf1-workspace-${workflowInstanceId}-${loadState.revision}`;

	function handleManualRefresh(): void { void reloadWorkspace(); }

	return <div className="hn-chatbotify-shell"><div className="hn-workspace-toolbar"><button className="hn-chatbotify-button secondary" type="button" disabled={loadState.submitState.busy} onClick={handleManualRefresh}>{loadState.submitState.busy ? "Refreshing..." : "Refresh"}</button></div>{loadState.submitState.error !== "" ? <p className="hn-chatbotify-error">{loadState.submitState.error}</p> : null}<ChatBot key={chatBotKey} flow={flow} settings={settings} styles={styles} /></div>;
}
