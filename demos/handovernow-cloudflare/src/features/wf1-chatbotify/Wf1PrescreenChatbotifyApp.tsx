import { useMemo } from "react";
import ChatBot, { type Flow, type Settings, type Styles } from "react-chatbotify";
import type { PrescreenConfig } from "./types";
import PrescreenConversationCard from "./PrescreenConversationCard";
import { startTrace } from "./debugTrace";
import "./wf1-chatbotify.css";

const TRACE_SCOPE = "Wf1PrescreenChatbotifyApp";

type Wf1PrescreenChatbotifyAppProps = {
	config: PrescreenConfig;
};

function createPrescreenFlow(config: PrescreenConfig): Flow {
	const trace = startTrace(TRACE_SCOPE, "createPrescreenFlow", {
		assetId: config.assetId,
		assetTitle: config.assetTitle,
		questionCount: config.questions.length,
		canSubmit: config.canSubmit,
	});

	const flow: Flow = {
		start: {
			message: "Interactive application",
			component: <PrescreenConversationCard config={config} />,
			chatDisabled: true,
		},
	};

	trace.end({ blockCount: Object.keys(flow).length, chatDisabled: true });
	return flow;
}

function createPrescreenSettings(): Settings {
	return {
		general: { embedded: true, showFooter: false },
		chatHistory: { disabled: true },
		voice: { disabled: true },
		audio: { disabled: true },
		notification: { disabled: true },
		tooltip: { mode: "NEVER" },
		chatInput: {
			disabledPlaceholderText: "Use the application card above",
			enabledPlaceholderText: "Type your answer",
			blockSpam: true,
		},
		header: { title: "HandoverNow screening", showAvatar: false },
		fileAttachment: { disabled: true },
		emoji: { disabled: true },
	};
}

function createPrescreenStyles(): Styles {
	return {
		chatWindowStyle: { width: "100%", height: "640px", borderRadius: "18px", boxShadow: "none" },
		headerStyle: { borderTopLeftRadius: "18px", borderTopRightRadius: "18px" },
		bodyStyle: { padding: "12px" },
		botBubbleStyle: { maxWidth: "96%" },
		userBubbleStyle: { maxWidth: "96%" },
	};
}

export default function Wf1PrescreenChatbotifyApp(props: Wf1PrescreenChatbotifyAppProps) {
	const config = props.config;

	const flow = useMemo(() => createPrescreenFlow(config), [config]);
	const settings = useMemo(() => createPrescreenSettings(), []);
	const styles = useMemo(() => createPrescreenStyles(), []);

	return (
		<div className="hn-chatbotify-shell">
			<ChatBot flow={flow} settings={settings} styles={styles} />
		</div>
	);
}
