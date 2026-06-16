import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import "./wf1-chatbotify.css";

type DialogPosition = {
	left: number;
	top: number;
};

type DragState = {
	startX: number;
	startY: number;
	startLeft: number;
	startTop: number;
};

type HandoverNowAgentDialogProps = {
	open: boolean;
	title: string;
	subtitle?: string;
	kicker?: string;
	width?: string;
	height?: string;
	minWidth?: string;
	minHeight?: string;
	resizable?: boolean;
	draggable?: boolean;
	onClose: () => void;
	children: ReactNode;
};

function boundedPosition(left: number, top: number): DialogPosition {
	const maxLeft = Math.max(8, window.innerWidth - 120);
	const maxTop = Math.max(8, window.innerHeight - 90);

	return {
		left: Math.min(Math.max(8, left), maxLeft),
		top: Math.min(Math.max(8, top), maxTop),
	};
}

export default function HandoverNowAgentDialog(props: HandoverNowAgentDialogProps) {
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const dragStateRef = useRef<DragState | null>(null);
	const [position, setPosition] = useState<DialogPosition | null>(null);
	const draggable = props.draggable ?? true;
	const resizable = props.resizable ?? true;

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		if (props.open && !dialog.open) {
			dialog.showModal();
		}

		if (!props.open && dialog.open) {
			dialog.close();
		}
	}, [props.open]);

	useEffect(() => {
		function onResize(): void {
			setPosition((current) => (current ? boundedPosition(current.left, current.top) : current));
		}

		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	function closeDialog(): void {
		props.onClose();
	}

	function onPointerDown(event: PointerEvent<HTMLElement>): void {
		if (!draggable) return;

		const dialog = dialogRef.current;
		if (!dialog) return;

		const rect = dialog.getBoundingClientRect();
		const currentPosition = position ?? { left: rect.left, top: rect.top };

		dragStateRef.current = {
			startX: event.clientX,
			startY: event.clientY,
			startLeft: currentPosition.left,
			startTop: currentPosition.top,
		};

		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent<HTMLElement>): void {
		const dragState = dragStateRef.current;
		if (!dragState) return;

		setPosition(
			boundedPosition(
				dragState.startLeft + event.clientX - dragState.startX,
				dragState.startTop + event.clientY - dragState.startY,
			),
		);
	}

	function onPointerUp(event: PointerEvent<HTMLElement>): void {
		if (!dragStateRef.current) return;
		dragStateRef.current = null;
		event.currentTarget.releasePointerCapture(event.pointerId);
	}

	const dialogStyle: CSSProperties = {
		width: props.width ?? "min(96vw, 920px)",
		height: props.height ?? "min(92vh, 780px)",
		minWidth: props.minWidth ?? "340px",
		minHeight: props.minHeight ?? "520px",
		left: position ? `${position.left}px` : undefined,
		top: position ? `${position.top}px` : undefined,
		margin: position ? "0" : "auto",
		padding: 0,
		border: 0,
		borderRadius: "24px",
		background: "transparent",
		resize: resizable ? "both" : "none",
		overflow: "hidden",
	};

	return (
		<dialog ref={dialogRef} className="hn-agent-dialog" style={dialogStyle} onCancel={closeDialog}>
			<section className="hn-agent-dialog-shell">
				<header
					className={`hn-agent-dialog-header${draggable ? " draggable" : ""}`}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
				>
					<div>
						<p className="rental-kicker">{props.kicker ?? "HandoverNow agent"}</p>
						<h2>{props.title}</h2>
						{props.subtitle ? <p className="hn-chatbotify-muted">{props.subtitle}</p> : null}
					</div>
					<button className="hn-chatbotify-button secondary" type="button" onClick={closeDialog}>
						Close
					</button>
				</header>
				<div className="hn-agent-dialog-body">{props.children}</div>
			</section>
		</dialog>
	);
}
