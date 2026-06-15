import type { PrescreenConfig } from "./types";
import PrescreenConversationCard from "./PrescreenConversationCard";
import HandoverNowChatbotifyShell from "./HandoverNowChatbotifyShell";

type Wf1PrescreenChatbotifyAppProps = {
	config: PrescreenConfig;
};

export default function Wf1PrescreenChatbotifyApp(props: Wf1PrescreenChatbotifyAppProps) {
	return (
		<HandoverNowChatbotifyShell
			title="HandoverNow screening"
			message="Interactive application"
			disabledPlaceholderText="Use the application card above"
			height="640px"
		>
			<PrescreenConversationCard config={props.config} />
		</HandoverNowChatbotifyShell>
	);
}