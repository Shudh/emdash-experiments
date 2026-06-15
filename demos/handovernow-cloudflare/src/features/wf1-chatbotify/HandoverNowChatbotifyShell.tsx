import { useMemo, type ReactNode } from "react";
import ChatBot, { type Flow, type Settings, type Styles } from "react-chatbotify";
import { startTrace } from "./debugTrace";
import "./wf1-chatbotify.css";

const TRACE_SCOPE = "HandoverNowChatbotifyShell";

type HandoverNowChatbotifyShellProps = {
	title: string;
	message: string;
	disabledPlaceholderText: string;
	height?: string;
	children: ReactNode;
};

function createFlow(message: string, component: ReactNode): Flow {
	const trace = startTrace(TRACE_SCOPE, "createFlow", { message });

	const flow: Flow = {
		start: {
			message,
			component,
			chatDisabled: true,
		},
	};

	trace.end({ blockCount: Object.keys(flow).length, chatDisabled: true });
	return flow;
}

function createSettings(title: string, disabledPlaceholderText: string): Settings {
	return {
		general: { embedded: true, showFooter: false },
		chatHistory: { disabled: true },
		voice: { disabled: true },
		audio: { disabled: true },
		notification: { disabled: true },
		tooltip: { mode: "NEVER" },
		chatInput: {
			disabledPlaceholderText,
			enabledPlaceholderText: "Type your answer",
			blockSpam: true,
		},
		header: { title, showAvatar: false },
		fileAttachment: { disabled: true },
		emoji: { disabled: true },
	};
}

function createStyles(height: string): Styles {
	return {
		chatWindowStyle: { width: "100%", height, borderRadius: "18px", boxShadow: "none" },
		headerStyle: { borderTopLeftRadius: "18px", borderTopRightRadius: "18px" },
		bodyStyle: { padding: "12px" },
		botBubbleStyle: { maxWidth: "96%" },
		userBubbleStyle: { maxWidth: "96%" },
	};
}

export default function HandoverNowChatbotifyShell(props: HandoverNowChatbotifyShellProps) {
	const height = props.height ?? "640px";
	const flow = useMemo(() => createFlow(props.message, props.children), [props.message, props.children]);
	const settings = useMemo(
		() => createSettings(props.title, props.disabledPlaceholderText),
		[props.title, props.disabledPlaceholderText],
	);
	const styles = useMemo(() => createStyles(height), [height]);

	return (
		<div className="hn-chatbotify-shell">
			<ChatBot flow={flow} settings={settings} styles={styles} />
		</div>
	);
}