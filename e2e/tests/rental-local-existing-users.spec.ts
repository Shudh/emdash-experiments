import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";

const BASE_URL = "http://localhost:4444";
const JSON_HEADERS = {
"Content-Type": "application/json",
"X-EmDash-Request": "1",
};

type LocalActor = {
context: BrowserContext;
page: Page;
user: {
id: string;
email: string;
name?: string | null;
role?: unknown;
};
cookie: string;
};

type ApiResult<T> = {
status: number;
body: {
ok?: boolean;
data?: T;
error?: {
code: string;
message: string;
};
};
};

async function cookieHeader(context: BrowserContext): Promise<string> {
return (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function loginAs(browser: Browser, email: string): Promise<LocalActor> {
const context = await browser.newContext({ baseURL: BASE_URL });
const page = await context.newPage();

await page.goto("/", { waitUntil: "domcontentloaded" });

const user = await page.evaluate(async (loginEmail) => {
const response = await fetch("/api/setup/dev-login-as", {
method: "POST",
headers: {
"Content-Type": "application/json",
"X-EmDash-Request": "1",
},
body: JSON.stringify({ email: loginEmail }),
});

const payload = await response.json();

if (!response.ok) {
throw new Error(JSON.stringify(payload));
}

return payload.data.user;
}, email);

const cookie = await cookieHeader(context);

const me = await fetch(`${BASE_URL}/_emdash/api/auth/me`, {
headers: { Cookie: cookie },
});
expect(me.status).toBe(200);

const meBody = (await me.json()) as {
data?: {
id?: string;
email?: string;
role?: unknown;
};
};

expect(meBody.data?.id).toBe(user.id);
expect(meBody.data?.email).toBe(email);

return { context, page, user, cookie };
}

async function rentalRequest<T = unknown>(
actor: LocalActor,
method: "GET" | "POST",
path: string,
body?: unknown,
): Promise<ApiResult<T>> {
const response =
method === "GET"
? await fetch(`${BASE_URL}${path}`, {
method,
headers: {
Cookie: actor.cookie,
},
})
: await fetch(`${BASE_URL}${path}`, {
method,
headers: {
...JSON_HEADERS,
Cookie: actor.cookie,
},
body: JSON.stringify(body ?? {}),
});

return {
status: response.status,
body: (await response.json()) as ApiResult<T>["body"],
};
}

async function mustRentalRequest<T = unknown>(
actor: LocalActor,
method: "GET" | "POST",
path: string,
body?: unknown,
): Promise<T> {
const result = await rentalRequest<T>(actor, method, path, body);

if (result.status >= 400) {
throw new Error(`${method} ${path} failed ${result.status}: ${JSON.stringify(result.body)}`);
}

if (!result.body.data) {
throw new Error(`${method} ${path} returned no data: ${JSON.stringify(result.body)}`);
}

return result.body.data;
}

async function anonymousGet<T = unknown>(path: string): Promise<ApiResult<T>> {
const response = await fetch(`${BASE_URL}${path}`, {
method: "GET",
});

return {
status: response.status,
body: (await response.json()) as ApiResult<T>["body"],
};
}

async function anonymousPost<T = unknown>(path: string, body: unknown): Promise<ApiResult<T>> {
const response = await fetch(`${BASE_URL}${path}`, {
method: "POST",
headers: JSON_HEADERS,
body: JSON.stringify(body),
});

return {
status: response.status,
body: (await response.json()) as ApiResult<T>["body"],
};
}

async function resetRentalStore(): Promise<void> {
const response = await fetch(`${BASE_URL}/api/rental/reset`, {
method: "POST",
headers: JSON_HEADERS,
body: "{}",
});

expect(response.status).toBe(200);
}

test("local persistent users run full rental lifecycle without passkey recreation", async ({
browser,
}) => {
test.setTimeout(120_000);

const owner = await loginAs(browser, RENTAL_LOCAL_USERS.owner.email);
const tenant = await loginAs(browser, RENTAL_LOCAL_USERS.tenant.email);

try {
await resetRentalStore();

const addData = await mustRentalRequest<{
asset: Record<string, unknown>;
}>(owner, "POST", "/api/rental/owner/assets/add", {
assetKind: "flat",
title: "Manual Local Full Flow Flat",
locationLabel: "Bangalore",
publicPrice: 60000,
currency: "INR",
ownerConditionsSpec: {
depositPolicy: "Two months deposit covers chargeable damage.",
documentsRequired: ["company_id", "salary_slip"],
},
});

const asset = addData.asset;

expect(asset.owner_user_id).toBe(owner.user.id);
expect(asset.author_id).toBe(owner.user.id);
expect(String(owner.user.role)).not.toBe("owner");

await mustRentalRequest(owner, "POST", `/api/rental/owner/assets/${asset.id}/config`, {
publicPrice: 60000,
minimumMonths: 11,
configSpec: {
bedrooms: 2,
furnishing: "semi_furnished",
},
conditionSpec: {
walls: "freshly_painted",
},
items: [
{
itemKind: "appliance",
itemLabel: "Geyser",
ownerDeclaredState: "working",
itemSpec: {
brand: "AO Smith",
capacityLitres: 25,
},
},
],
});

const publishedData = await mustRentalRequest<{
asset: Record<string, unknown>;
}>(owner, "POST", `/api/rental/owner/assets/${asset.id}/publish-to-marketplace`);

expect(publishedData.asset.status).toBe("published");
expect(publishedData.asset.business_state).toBe("listed");
expect(publishedData.asset.visibility_state).toBe("marketplace");

const publicList = await anonymousGet<{
items: Array<Record<string, unknown>>;
}>("/api/rental/marketplace/assets");

expect(publicList.status).toBe(200);
expect(publicList.body.data?.items.some((item) => item.id === asset.id)).toBe(true);

const publicDetails = await anonymousGet<{
asset: Record<string, unknown>;
ownerConditions: {
version: number;
hash: string;
spec: Record<string, unknown>;
};
}>(`/api/rental/marketplace/assets/${asset.id}`);

expect(publicDetails.status).toBe(200);
expect(publicDetails.body.data?.asset.id).toBe(asset.id);
expect(publicDetails.body.data?.ownerConditions.spec.depositPolicy).toContain("Two months");

const anonymousInterest = await anonymousPost(
`/api/rental/marketplace/assets/${asset.id}/express-interest`,
{
name: "Anonymous Should Fail",
},
);

expect(anonymousInterest.status).toBe(401);

const missingConditions = await rentalRequest(
tenant,
"POST",
`/api/rental/marketplace/assets/${asset.id}/express-interest`,
{
name: "Tenant Manual Created 1",
officialEmail: "tenant_manual_created_1@company.example.com",
employerName: "Manual Company",
offeredPrice: 59000,
},
);

expect(missingConditions.status).toBe(422);

const ownerConditions = publicDetails.body.data?.ownerConditions;

if (!ownerConditions) {
throw new Error(`Public details returned no ownerConditions: ${JSON.stringify(publicDetails.body)}`);
}

const interestData = await mustRentalRequest<{
interest: Record<string, unknown>;
asset: Record<string, unknown>;
}>(tenant, "POST", `/api/rental/marketplace/assets/${asset.id}/express-interest`, {
name: "Tenant Manual Created 1",
officialEmail: "tenant_manual_created_1@company.example.com",
employerName: "Manual Company",
offeredPrice: 59000,
message: "Interested after accepting owner conditions.",
interestSpec: {
salaryBand: "25L",
companyInfo: "Manual Company",
},
acceptedConditionsVersion: Number(ownerConditions.version),
acceptedConditionsHash: String(ownerConditions.hash),
});

const interest = interestData.interest;

expect(interest.interested_user_id).toBe(tenant.user.id);
expect(interest.owner_user_id).toBe(owner.user.id);
expect(interest.interest_state).toBe("submitted");
expect(interest.accepted_conditions_snapshot).toEqual(ownerConditions.spec);

const ownerDashboardData = await mustRentalRequest<{
assets: Array<Record<string, unknown>>;
inbox: Array<Record<string, unknown>>;
}>(owner, "GET", "/api/rental/owner/dashboard");

expect(ownerDashboardData.inbox).toEqual(
expect.arrayContaining([
expect.objectContaining({
asset_id: asset.id,
interested_user_id: tenant.user.id,
official_email: "tenant_manual_created_1@company.example.com",
employer_name: "Manual Company",
interest_state: "submitted",
}),
]),
);

await mustRentalRequest(owner, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
roundPhase: "pre_agreement",
roundKind: "question",
actorRole: "renter",
message: "Please upload company ID and salary slip.",
});

await mustRentalRequest(tenant, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
roundPhase: "pre_agreement",
roundKind: "answer",
roundState: "answered",
message: "Company ID and salary slip shared.",
termsSpec: {
document: "company_id",
},
});

await mustRentalRequest(tenant, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
roundPhase: "pre_agreement",
roundKind: "offer",
roundState: "offered",
price: 59000,
minimumMonths: 11,
depositAmount: 118000,
message: "Offer at 59k with two months deposit.",
});

await mustRentalRequest(owner, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
roundPhase: "pre_agreement",
roundKind: "rejection",
roundState: "rejected",
message: "Rejecting 59k without full deposit.",
});

await mustRentalRequest(owner, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
roundPhase: "pre_agreement",
roundKind: "counter",
roundState: "countered",
price: 60000,
minimumMonths: 11,
depositAmount: 120000,
message: "Counter at listed rent with deep cleaning included.",
});

const acceptanceData = await mustRentalRequest<{
round: Record<string, unknown>;
}>(tenant, "POST", `/api/rental/negotiations/${interest.id}/add-round`, {
roundPhase: "pre_agreement",
roundKind: "acceptance",
roundState: "accepted",
price: 60000,
minimumMonths: 11,
depositAmount: 120000,
message: "Accepted final terms.",
});

const threadData = await mustRentalRequest<{
rounds: Array<Record<string, unknown>>;
}>(owner, "GET", `/api/rental/negotiations/${interest.id}`);

expect(threadData.rounds.map((round) => round.actor_user_id)).toEqual([
owner.user.id,
tenant.user.id,
tenant.user.id,
owner.user.id,
owner.user.id,
tenant.user.id,
]);

expect(threadData.rounds.map((round) => round.actor_role)).toEqual([
"owner",
"renter",
"renter",
"owner",
"owner",
"renter",
]);

expect(threadData.rounds.every((round) => round.round_phase === "pre_agreement")).toBe(true);

const agreementData = await mustRentalRequest<{
agreement: Record<string, unknown>;
asset: Record<string, unknown>;
access: Array<Record<string, unknown>>;
}>(owner, "POST", `/api/rental/negotiations/${interest.id}/accept-final-terms`, {
acceptedRoundId: acceptanceData.round.id,
agreementKind: "flat_rental",
effectiveFrom: "2026-07-01",
});

const agreement = agreementData.agreement;

expect(agreementData.asset.visibility_state).toBe("restricted");
expect(agreementData.asset.business_state).toBe("booked");
expect(agreementData.asset.active_renter_user_id).toBe(tenant.user.id);

expect(agreementData.access.map((entry) => entry.user_id).toSorted()).toEqual(
[owner.user.id, tenant.user.id].toSorted(),
);

const printableSnapshot = agreement.printable_snapshot as Record<string, unknown>;
const printableSnapshotText = JSON.stringify(printableSnapshot);

expect(printableSnapshotText).toContain("Two months deposit");
expect(printableSnapshotText).toContain("Accepted final terms");

const afterAgreementListData = await anonymousGet<{
items: Array<Record<string, unknown>>;
}>("/api/rental/marketplace/assets");

expect(afterAgreementListData.status).toBe(200);
expect(afterAgreementListData.body.data?.items.some((item) => item.id === asset.id)).toBe(
false,
);

const anonymousRestrictedDetail = await anonymousGet(`/api/rental/marketplace/assets/${asset.id}`);
expect([403, 404]).toContain(anonymousRestrictedDetail.status);

const renterAgreementData = await mustRentalRequest<{
agreement: Record<string, unknown>;
}>(tenant, "GET", `/api/rental/agreements/${agreement.id}`);

expect(renterAgreementData.agreement.id).toBe(agreement.id);

const snapshotBeforeReturn = JSON.stringify(renterAgreementData.agreement.printable_snapshot);

const moveInData = await mustRentalRequest<{
handover: Record<string, unknown>;
checks: Array<Record<string, unknown>>;
}>(owner, "POST", `/api/rental/handover/${asset.id}/start`, {
handoverKind: "move_in",
summarySpec: {
keys: 2,
},
});

expect(moveInData.checks).toHaveLength(1);

const acceptedMoveInData = await mustRentalRequest<{
handover: Record<string, unknown>;
asset: Record<string, unknown>;
}>(tenant, "POST", `/api/rental/handover/${moveInData.handover.id}/accept`);

expect(acceptedMoveInData.handover.handover_state).toBe("accepted");
expect(acceptedMoveInData.asset.business_state).toBe("rented");

const moveOutData = await mustRentalRequest<{
handover: Record<string, unknown>;
checks: Array<Record<string, unknown>>;
}>(owner, "POST", `/api/rental/handover/${asset.id}/start`, {
handoverKind: "move_out",
baselineHandoverId: moveInData.handover.id,
});

expect(moveOutData.checks).toHaveLength(1);

const checkId = moveOutData.checks[0].id;

await mustRentalRequest(owner, "POST", `/api/rental/handover/${moveOutData.handover.id}/claim-damage`, {
handoverItemCheckId: checkId,
ownerClaimedState: "damaged",
estimatedRepairCost: 5000,
message: "Geyser damaged during stay.",
});

await mustRentalRequest(tenant, "POST", `/api/rental/handover/${moveOutData.handover.id}/add-round`, {
roundPhase: "return",
roundKind: "answer",
roundState: "answered",
message: "Disputing charge; issue pre-existed.",
});

await mustRentalRequest(owner, "POST", `/api/rental/handover/${moveOutData.handover.id}/add-round`, {
roundPhase: "return",
roundKind: "settlement_offer",
roundState: "countered",
message: "Settle at 2500.",
depositAmount: 2500,
});

await mustRentalRequest(tenant, "POST", `/api/rental/handover/${moveOutData.handover.id}/add-round`, {
roundPhase: "return",
roundKind: "acceptance",
roundState: "accepted",
message: "Accepted settlement.",
});

const settledData = await mustRentalRequest<{
handover: Record<string, unknown>;
asset: Record<string, unknown>;
}>(tenant, "POST", `/api/rental/handover/${moveOutData.handover.id}/settle`, {
settlementSpec: {
agreedRepairCost: 2500,
renterAccepted: true,
},
});

expect(settledData.handover.handover_state).toBe("closed");
expect(settledData.asset.business_state).toBe("maintenance");
expect(settledData.asset.visibility_state).toBe("private");

const handoverSessionData = await mustRentalRequest<{
handover: Record<string, unknown>;
checks: Array<Record<string, unknown>>;
rounds: Array<Record<string, unknown>>;
}>(owner, "GET", `/api/rental/handover/${moveOutData.handover.id}`);

expect(handoverSessionData.rounds.every((round) => round.round_phase === "return")).toBe(
true,
);

expect(handoverSessionData.checks[0].dispute_state).toBe("settlement_agreed");

const agreementAfterReturnData = await mustRentalRequest<{
agreement: Record<string, unknown>;
}>(tenant, "GET", `/api/rental/agreements/${agreement.id}`);

expect(JSON.stringify(agreementAfterReturnData.agreement.printable_snapshot)).toBe(
snapshotBeforeReturn,
);
} finally {
await owner.context.close();
await tenant.context.close();
}
});
