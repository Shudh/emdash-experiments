import type { DomainStore, UserContext } from "../../domain/types.js";
import { DomainError, asString } from "../../domain/types.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import type { RuntimeEnv } from "./runtime-env.js";
import {
	normalizeEmail,
	normalizePhone,
	validateSharedFormGuard,
} from "./form-guard.js";

export type ValidateLeadProtectionInput = {
	store: DomainStore;
	request: Request;
	user: UserContext;
	assetId: string;
	body: Record<string, unknown>;
	env?: RuntimeEnv;
};

export async function validateLeadProtection(input: ValidateLeadProtectionInput): Promise<void> {
	await validateSharedFormGuard({
		request: input.request,
		body: input.body,
		env: input.env,
		assetId: input.assetId,
		action: "lead_prescreen",
		requirePhone: true,
		requireHumanCheck: true,
		requireTurnstile: true,
	});

	await rejectDuplicateApplicantContact(input);
}

async function rejectDuplicateApplicantContact(input: ValidateLeadProtectionInput): Promise<void> {
	const phone = normalizePhone(input.body.phone);
	const email = normalizeEmail(input.body.officialEmail);

	const interests = await input.store.list(
		WORKFLOW_RENTAL_COLLECTIONS.INTERESTS,
		{ asset_id: input.assetId },
		{ orderBy: "created_at", direction: "desc", limit: 500 },
	);

	for (const interest of interests) {
		if (asString(interest.interested_user_id) === input.user.id) continue;

		if (phone && normalizePhone(interest.phone) === phone) {
			throw new DomainError(
				"DUPLICATE_PHONE_APPLICATION",
				"An application with this phone / WhatsApp number already exists for this asset.",
				409,
			);
		}

		if (email && normalizeEmail(interest.official_email) === email) {
			throw new DomainError(
				"DUPLICATE_EMAIL_APPLICATION",
				"An application with this email already exists for this asset.",
				409,
			);
		}
	}
}
