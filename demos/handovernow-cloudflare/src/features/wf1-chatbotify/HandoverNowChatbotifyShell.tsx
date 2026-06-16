import { useMemo, type ReactNode } from "react";
import ChatBot, { type Flow, type Settings, type Styles } from "react-chatbotify";
import { startTrace } from "./debugTrace";
import "./wf1-chatbotify.css";

const TRACE_SCOPE = "HandoverNowChatbotifyShell";

type ChatbotifyThemeRef = {
	id: string;
	version: string;
};

type FileUploadSettings = {
	enabled: boolean;
	multiple?: boolean;
	accept?: string;
	sendFileName?: boolean;
	showMediaDisplay?: boolean;
};

type HandoverNowChatbotifyShellProps = {
	title: string;
	message?: string;
	disabledPlaceholderText?: string;
	enabledPlaceholderText?: string;
	width?: string;
	height?: string;
	minWidth?: string;
	minHeight?: string;
	showFooter?: boolean;
	enableChatHistory?: boolean;
	storageKey?: string;
	fileUpload?: FileUploadSettings;
	themes?: ChatbotifyThemeRef[];
	styles?: Styles;
	flow?: Flow;
	children?: ReactNode;
};

function createComponentFlow(message: string, component: ReactNode): Flow {
	const trace = startTrace(TRACE_SCOPE, "createComponentFlow", { message });

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

function createSettings(props: HandoverNowChatbotifyShellProps): Settings {
	const fileUpload = props.fileUpload ?? { enabled: false };
	const showFooter = props.showFooter ?? fileUpload.enabled;
	const enableChatHistory = props.enableChatHistory ?? false;

	return {
		general: { embedded: true, showFooter },
		chatHistory: enableChatHistory
			? {
				disabled: false,
				storageKey: props.storageKey ?? "hn-chatbotify-history",
			}
			: { disabled: true },
		voice: { disabled: true },
		audio: { disabled: true },
		notification: { disabled: true },
		tooltip: { mode: "NEVER" },
		chatInput: {
			disabledPlaceholderText: props.disabledPlaceholderText ?? "Use the card above",
			enabledPlaceholderText: props.enabledPlaceholderText ?? "Type your answer",
			blockSpam: true,
		},
		header: { title: props.title, showAvatar: false },
		fileAttachment: {
			disabled: !fileUpload.enabled,
			multiple: fileUpload.multiple ?? true,
			accept: fileUpload.accept ?? "image/*,application/pdf",
			sendFileName: fileUpload.sendFileName ?? true,
			showMediaDisplay: fileUpload.showMediaDisplay ?? true,
		},
		emoji: { disabled: true },
	} as Settings;
}

function mergeStyles(base: Styles, override: Styles | undefined): Styles {
	if (!override) return base;

	return {
		...base,
		...override,
		chatWindowStyle: { ...base.chatWindowStyle, ...override.chatWindowStyle },
		headerStyle: { ...base.headerStyle, ...override.headerStyle },
		bodyStyle: { ...base.bodyStyle, ...override.bodyStyle },
		botBubbleStyle: { ...base.botBubbleStyle, ...override.botBubbleStyle },
		userBubbleStyle: { ...base.userBubbleStyle, ...override.userBubbleStyle },
		footerStyle: { ...base.footerStyle, ...override.footerStyle },
	};
}

function createStyles(props: HandoverNowChatbotifyShellProps): Styles {
	const base: Styles = {
		chatWindowStyle: {
			width: props.width ?? "100%",
			height: props.height ?? "640px",
			minWidth: props.minWidth ?? "320px",
			minHeight: props.minHeight ?? "420px",
			borderRadius: "22px",
			boxShadow: "0 24px 80px rgba(15, 23, 42, 0.20)",
			overflow: "hidden",
		},
		headerStyle: {
			borderTopLeftRadius: "22px",
			borderTopRightRadius: "22px",
		},
		bodyStyle: { padding: "14px" },
		botBubbleStyle: { maxWidth: "96%" },
		userBubbleStyle: { maxWidth: "96%" },
		footerStyle: {
			borderTop: "1px solid rgba(15, 23, 42, 0.10)",
		},
	};

	return mergeStyles(base, props.styles);
}

export default function HandoverNowChatbotifyShell(props: HandoverNowChatbotifyShellProps) {
	const flow = useMemo(() => {
		if (props.flow) {
			return props.flow;
		}

		return createComponentFlow(props.message ?? props.title, props.children ?? null);
	}, [props.flow, props.message, props.title, props.children]);

	const settings = useMemo(
		() => createSettings(props),
		[
			props.title,
			props.disabledPlaceholderText,
			props.enabledPlaceholderText,
			props.storageKey,
			props.enableChatHistory,
			props.showFooter,
			props.fileUpload,
		],
	);

	const styles = useMemo(
		() => createStyles(props),
		[props.width, props.height, props.minWidth, props.minHeight, props.styles],
	);

	return (
		<div className="hn-chatbotify-shell">
			<ChatBot flow={flow} settings={settings} styles={styles} themes={props.themes} />
		</div>
	);
}
