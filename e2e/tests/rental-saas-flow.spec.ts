import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "../fixtures";
import { addVirtualWebAuthnAuthenticator } from "../fixtures/virtual-authenticator";

const ADMIN_URL_PATTERN = /\/_emdash\/admin/;
const ADMIN_DASHBOARD_URL_PATTERN = /\/_emdash\/admin\/?$/;
const URL_IN_TEXT_REGEX = /https?:\/\/[^\s]+/;
const SERVER_INFO_PATH = join(tmpdir(), "emdash-pw-server.json");
const RENTAL_HEADERS = { "Content-Type": "application/json", "X-EmDash-Request": "1" };

type ServerInfo = { baseUrl: string; token: string; sessionCookie: string };
type ApiBody<T> = { ok?: boolean; data?: T; error?: { code: string; message: string } };

type RentalUser = {
	id: string;
	email: string;
	role: number;
	cookie: string;
	dispose: () => Promise<void>;
};

function getServerInfo(): ServerInfo {
	return JSON.parse(readFileSync(SERVER_INFO_PATH, "utf-8")) as ServerInfo;
}

async function cookieHeader(context: import("@playwright/test").BrowserContext): Promise<string> {
	return (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function currentUserFromCookies(cookie: string): Promise<Response> {
	return fetch(`${getServerInfo().baseUrl}/_emdash/api/auth/me`, { headers: { Cookie: cookie } });
}

async function createInviteViaApi(email: string, role = 30): Promise<string> {
	const { baseUrl, token, sessionCookie } = getServerInfo();
	await fetch(`${baseUrl}/_emdash/api/dev/emails`, {
		method: "DELETE",
		headers: { "X-EmDash-Request": "1", Cookie: sessionCookie },
	});

	const createRes = await fetch(`${baseUrl}/_emdash/api/auth/invite`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-EmDash-Request": "1",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ email, role }),
	});
	if (!createRes.ok)
		throw new Error(`Invite creation failed: ${createRes.status} ${await createRes.text()}`);
	const createBody = (await createRes.json()) as { data?: { inviteUrl?: string } };
	if (createBody.data?.inviteUrl) return createBody.data.inviteUrl;

	const emailsRes = await fetch(`${baseUrl}/_emdash/api/dev/emails`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!emailsRes.ok)
		throw new Error(`Dev emails failed: ${emailsRes.status} ${await emailsRes.text()}`);
	const emailsBody = (await emailsRes.json()) as {
		data?: { items?: Array<{ message: { text: string } }> };
	};
	const latestEmail = emailsBody.data?.items?.[0];
	const match = latestEmail?.message.text.match(URL_IN_TEXT_REGEX);
	if (!match) throw new Error("Invite email did not contain an invite URL");
	return match[0];
}

async function registerInvitedUser(
	browser: import("@playwright/test").Browser,
	email: string,
	name: string,
): Promise<RentalUser> {
	const context = await browser.newContext({ baseURL: getServerInfo().baseUrl });
	const page = await context.newPage();
	const inviteUrl = await createInviteViaApi(email, 30);
	const inviteToken = new URL(inviteUrl).searchParams.get("token")!;
	const removeAuth = await addVirtualWebAuthnAuthenticator(page);
	try {
		await page.goto(`/_emdash/admin/invite/accept?token=${inviteToken}`);
		await page.waitForSelector("astro-island:not([ssr])", { timeout: 60_000 });
		await page.getByLabel("Your name (optional)").fill(name);
		await page.getByRole("button", { name: "Create Account" }).click();
		await expect(page).toHaveURL(ADMIN_URL_PATTERN, { timeout: 60_000 });

		// Invite registration creates the passkey-backed user. Log out any transient
		// post-registration session and then sign in with that same virtual
		// authenticator so subsequent API calls use an explicit real session cookie.
		await page.evaluate(async () => {
			await fetch("/_emdash/api/auth/logout", {
				method: "POST",
				headers: { "X-EmDash-Request": "1" },
			});
		});
		await page.goto("/_emdash/admin/login", { waitUntil: "domcontentloaded" }).catch((error) => {
			if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) throw error;
		});
		await page.waitForSelector("astro-island:not([ssr])", { timeout: 60_000 });
		if (!ADMIN_DASHBOARD_URL_PATTERN.test(page.url())) {
			await page.getByRole("button", { name: /Sign in with Passkey/i }).click();
			await expect(page).toHaveURL(ADMIN_DASHBOARD_URL_PATTERN, { timeout: 60_000 });
		}
		const cookie = await cookieHeader(context);
		const me = await currentUserFromCookies(cookie);
		expect(me.status).toBe(200);
		const meBody = (await me.json()) as { data: { id: string; email: string; role: number } };
		return {
			id: meBody.data.id,
			email: meBody.data.email,
			role: meBody.data.role,
			cookie,
			dispose: () => context.close(),
		};
	} finally {
		await removeAuth();
	}
}

async function rentalRequest<T>(
	user: RentalUser,
	method: string,
	path: string,
	body?: unknown,
): Promise<{ status: number; body: ApiBody<T> }> {
	const response =
		method === "GET"
			? await fetch(`${getServerInfo().baseUrl}${path}`, {
					method,
					headers: { Cookie: user.cookie },
				})
			: await fetch(`${getServerInfo().baseUrl}${path}`, {
					method,
					headers: { ...RENTAL_HEADERS, Cookie: user.cookie },
					body: JSON.stringify(body ?? {}),
				});
	return { status: response.status, body: (await response.json()) as ApiBody<T> };
}

async function anonymousPost(
	path: string,
	body: unknown,
): Promise<{ status: number; body: ApiBody<unknown> }> {
	const response = await fetch(`${getServerInfo().baseUrl}${path}`, {
		method: "POST",
		headers: RENTAL_HEADERS,
		body: JSON.stringify(body),
	});
	return { status: response.status, body: (await response.json()) as ApiBody<unknown> };
}

test.describe("rental SaaS flow with real EmDash sessions", () => {
	test.describe.configure({ mode: "serial" });

	test("rental lifecycle uses real invited passkey users and session cookies", async ({
		browser,
	}) => {
		test.setTimeout(180_000);
		const reset = await fetch(`${getServerInfo().baseUrl}/api/rental/reset`, {
			method: "POST",
			headers: { "X-EmDash-Request": "1" },
		});
		expect(reset.status).toBe(200);

		const unique = Date.now();
		const owner = await registerInvitedUser(
			browser,
			`rental-owner-${unique}@example.com`,
			"Rental Owner",
		);
		const renter = await registerInvitedUser(
			browser,
			`rental-renter-${unique}@example.com`,
			"Rental Renter",
		);
		const unrelated = await registerInvitedUser(
			browser,
			`rental-other-${unique}@example.com`,
			"Rental Other",
		);

		try {
			expect(String(owner.role)).not.toBe("owner");

			const add = await rentalRequest<any>(owner, "POST", "/api/rental/owner/assets/add", {
				assetKind: "flat",
				title: "Session-backed rental flat",
				locationLabel: "Indiranagar",
				publicPrice: 60000,
				ownerConditionsSpec: {
					depositPolicy: "Two months deposit covers chargeable damage.",
					documentsRequired: ["company_id", "salary_slip"],
				},
			});
			expect(add.status).toBe(201);
			const asset = add.body.data.asset;
			expect(asset.owner_user_id).toBe(owner.id);
			expect(asset.author_id).toBe(owner.id);

			await rentalRequest(owner, "POST", `/api/rental/owner/assets/${asset.id}/config`, {
				publicPrice: 60000,
				minimumMonths: 11,
				configSpec: { bedrooms: 2, furnishing: "semi_furnished" },
				conditionSpec: { walls: "freshly_painted" },
				items: [{ itemKind: "appliance", itemLabel: "Geyser", ownerDeclaredState: "working" }],
			});
			const published = await rentalRequest<any>(
				owner,
				"POST",
				`/api/rental/owner/assets/${asset.id}/publish-to-marketplace`,
			);
			expect(published.status).toBe(200);

			const publicList = await fetch(`${getServerInfo().baseUrl}/api/rental/marketplace/assets`);
			expect(publicList.status).toBe(200);
			const publicListBody = (await publicList.json()) as ApiBody<{ items: any[] }>;
			expect(publicListBody.data?.items.some((item) => item.id === asset.id)).toBe(true);

			const publicDetails = await fetch(
				`${getServerInfo().baseUrl}/api/rental/marketplace/assets/${asset.id}`,
			);
			expect(publicDetails.status).toBe(200);
			const detailsBody = (await publicDetails.json()) as ApiBody<any>;
			expect(detailsBody.data.ownerConditions.spec.depositPolicy).toContain("deposit");

			const anonInterest = await anonymousPost(
				`/api/rental/marketplace/assets/${asset.id}/express-interest`,
				{
					name: "Anonymous",
				},
			);
			expect(anonInterest.status).toBe(401);

			const missingConditions = await rentalRequest(
				renter,
				"POST",
				`/api/rental/marketplace/assets/${asset.id}/express-interest`,
				{ name: "Rental Renter" },
			);
			expect(missingConditions.status).toBe(422);

			const acceptedInterest = await rentalRequest<any>(
				renter,
				"POST",
				`/api/rental/marketplace/assets/${asset.id}/express-interest`,
				{
					name: "Rental Renter",
					officialEmail: renter.email,
					employerName: "SaaS Corp",
					offeredPrice: 58000,
					interestSpec: { salaryBand: "25L", companyInfo: "Series B SaaS" },
					acceptedConditionsVersion: detailsBody.data.ownerConditions.version,
					acceptedConditionsHash: detailsBody.data.ownerConditions.hash,
				},
			);
			expect(acceptedInterest.status).toBe(201);
			const interest = acceptedInterest.body.data.interest;
			expect(interest.interested_user_id).toBe(renter.id);
			expect(interest.accepted_conditions_snapshot).toEqual(detailsBody.data.ownerConditions.spec);

			await rentalRequest(owner, "POST", `/api/rental/owner/assets/${asset.id}/config`, {
				items: [],
				ownerConditionsSpec: { depositPolicy: "Updated for later renters only." },
			});
			expect(interest.accepted_conditions_snapshot.depositPolicy).toContain("Two months");

			const inbox = await rentalRequest<any>(owner, "GET", "/api/rental/owner/dashboard");
			expect(inbox.body.data.inbox).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						asset_id: asset.id,
						interested_user_id: renter.id,
						official_email: renter.email,
						employer_name: "SaaS Corp",
						interest_state: "submitted",
					}),
				]),
			);

			await rentalRequest(owner, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
				roundPhase: "pre_agreement",
				roundKind: "question",
				actorRole: "renter",
				message: "Please upload company ID.",
			});
			await rentalRequest(renter, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
				roundPhase: "pre_agreement",
				roundKind: "answer",
				roundState: "answered",
				message: "Company ID uploaded.",
				termsSpec: { document: "company_id" },
			});
			await rentalRequest(renter, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
				roundPhase: "pre_agreement",
				roundKind: "offer",
				price: 59000,
				message: "Can close at 59k.",
			});
			await rentalRequest(owner, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
				roundPhase: "pre_agreement",
				roundKind: "rejection",
				roundState: "rejected",
				message: "Rejecting 59k without full deposit.",
			});
			await rentalRequest(owner, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
				roundPhase: "pre_agreement",
				roundKind: "counter",
				price: 60000,
				message: "Counter at listed rent with deep cleaning.",
			});
			const acceptance = await rentalRequest<any>(
				renter,
				"POST",
				`/api/rental/negotiations/${interest.id}/add-round`,
				{
					roundPhase: "pre_agreement",
					roundKind: "acceptance",
					roundState: "accepted",
					price: 60000,
					minimumMonths: 11,
					depositAmount: 120000,
					message: "Accepted final terms.",
				},
			);

			const thread = await rentalRequest<any>(
				owner,
				"GET",
				`/api/rental/negotiations/${interest.id}`,
			);
			expect(thread.body.data.rounds.map((round) => round.actor_user_id)).toEqual([
				owner.id,
				renter.id,
				renter.id,
				owner.id,
				owner.id,
				renter.id,
			]);
			expect(thread.body.data.rounds.map((round) => round.actor_role)).toEqual([
				"owner",
				"renter",
				"renter",
				"owner",
				"owner",
				"renter",
			]);

			const agreementResult = await rentalRequest<any>(
				owner,
				"POST",
				`/api/rental/negotiations/${interest.id}/accept-final-terms`,
				{
					acceptedRoundId: acceptance.body.data.round.id,
					agreementKind: "flat_rental",
					effectiveFrom: "2026-07-01",
				},
			);
			expect(agreementResult.status).toBe(201);
			const agreement = agreementResult.body.data.agreement;
			expect(agreement.printable_snapshot.owner_conditions.spec.depositPolicy).toContain("Updated");
			expect(
				agreement.printable_snapshot.renter_accepted_conditions.snapshot.depositPolicy,
			).toContain("Two months");
			expect(agreementResult.body.data.asset.visibility_state).toBe("restricted");

			const afterAgreementList = await fetch(
				`${getServerInfo().baseUrl}/api/rental/marketplace/assets`,
			);
			const afterAgreementBody = (await afterAgreementList.json()) as ApiBody<{ items: any[] }>;
			expect(afterAgreementBody.data?.items.some((item) => item.id === asset.id)).toBe(false);

			const renterAgreement = await rentalRequest<any>(
				renter,
				"GET",
				`/api/rental/agreements/${agreement.id}`,
			);
			expect(renterAgreement.status).toBe(200);
			const unrelatedAgreement = await rentalRequest<any>(
				unrelated,
				"GET",
				`/api/rental/agreements/${agreement.id}`,
			);
			expect(unrelatedAgreement.status).toBe(403);
			const snapshotBeforeReturn = JSON.stringify(
				renterAgreement.body.data.agreement.printable_snapshot,
			);

			const moveIn = await rentalRequest<any>(
				owner,
				"POST",
				`/api/rental/handover/${asset.id}/start`,
				{
					handoverKind: "move_in",
					summarySpec: { keys: 2 },
				},
			);
			await rentalRequest(
				renter,
				"POST",
				`/api/rental/handover/${moveIn.body.data.handover.id}/accept`,
			);
			const moveOut = await rentalRequest<any>(
				owner,
				"POST",
				`/api/rental/handover/${asset.id}/start`,
				{
					handoverKind: "move_out",
					baselineHandoverId: moveIn.body.data.handover.id,
				},
			);
			const checkId = moveOut.body.data.checks[0].id;
			await rentalRequest(
				owner,
				"POST",
				`/api/rental/handover/${moveOut.body.data.handover.id}/claim-damage`,
				{
					handoverItemCheckId: checkId,
					ownerClaimedState: "damaged",
					estimatedRepairCost: 5000,
					message: "Geyser damaged during stay.",
				},
			);
			await rentalRequest(
				renter,
				"POST",
				`/api/rental/handover/${moveOut.body.data.handover.id}/add-round`,
				{
					roundPhase: "return",
					roundKind: "answer",
					roundState: "answered",
					message: "Disputing charge; issue pre-existed.",
				},
			);
			await rentalRequest(
				owner,
				"POST",
				`/api/rental/handover/${moveOut.body.data.handover.id}/add-round`,
				{
					roundPhase: "return",
					roundKind: "settlement_offer",
					roundState: "countered",
					message: "Settle at 2500.",
					depositAmount: 2500,
				},
			);
			await rentalRequest(
				renter,
				"POST",
				`/api/rental/handover/${moveOut.body.data.handover.id}/add-round`,
				{
					roundPhase: "return",
					roundKind: "acceptance",
					roundState: "accepted",
					message: "Accepted settlement.",
				},
			);
			const settled = await rentalRequest<any>(
				renter,
				"POST",
				`/api/rental/handover/${moveOut.body.data.handover.id}/settle`,
				{
					settlementSpec: { agreedRepairCost: 2500, renterAccepted: true },
				},
			);
			expect(settled.body.data.handover.handover_state).toBe("closed");
			expect(settled.body.data.asset.business_state).toBe("maintenance");
			expect(settled.body.data.asset.visibility_state).toBe("private");

			const handoverSession = await rentalRequest<any>(
				owner,
				"GET",
				`/api/rental/handover/${moveOut.body.data.handover.id}`,
			);
			expect(
				handoverSession.body.data.rounds.every((round) => round.round_phase === "return"),
			).toBe(true);
			expect(handoverSession.body.data.checks[0].dispute_state).toBe("settlement_agreed");

			const agreementAfterReturn = await rentalRequest<any>(
				owner,
				"GET",
				`/api/rental/agreements/${agreement.id}`,
			);
			expect(JSON.stringify(agreementAfterReturn.body.data.agreement.printable_snapshot)).toBe(
				snapshotBeforeReturn,
			);
		} finally {
			await Promise.all([owner.dispose(), renter.dispose(), unrelated.dispose()]);
		}
	});
});
