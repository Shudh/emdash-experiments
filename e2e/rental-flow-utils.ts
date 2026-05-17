import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

export const LOCAL_RENTAL_BASE_URL = "http://localhost:4444";

export const RENTAL_JSON_HEADERS = {
	"Content-Type": "application/json",
	"X-EmDash-Request": "1",
};

export type ApiBody<T> = {
	ok?: boolean;
	data?: T;
	error?: {
		code: string;
		message: string;
	};
};

export type ApiResult<T> = {
	status: number;
	body: ApiBody<T>;
};

export type RentalApiActor = {
	cookie: string;
	id?: string;
	email?: string;
	user?: {
		id: string;
		email: string;
		name?: string | null;
		role?: unknown;
	};
};

export type LocalRentalActor = {
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

export type PublishedFlatResult = {
	title: string;
	asset: Record<string, unknown>;
	publishedAsset: Record<string, unknown>;
	publicDetails: {
		asset: Record<string, unknown>;
		ownerConditions: {
			version: number;
			hash: string;
			spec: Record<string, unknown>;
		};
	};
	ownerConditions: {
		version: number;
		hash: string;
		spec: Record<string, unknown>;
	};
};

export type CreatePublishedFlatOptions = {
	baseUrl?: string;
	title?: string;
	assetKind?: string;
	locationLabel?: string;
	publicPrice?: number;
	currency?: string;
	minimumMonths?: number;
	configSpec?: Record<string, unknown>;
	conditionSpec?: Record<string, unknown>;
	ownerConditionsSpec?: Record<string, unknown>;
	items?: Array<Record<string, unknown>>;
};

export function timeSuffix(date = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, "0");

	return `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function uniqueRentalTitle(prefix = "Habitat Mayflower"): string {
	return `${prefix} ${timeSuffix()}`;
}

export async function cookieHeader(context: BrowserContext): Promise<string> {
	return (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export async function loginAsLocalRentalUser(
	browser: Browser,
	email: string,
	baseUrl = LOCAL_RENTAL_BASE_URL,
): Promise<LocalRentalActor> {
	const context = await browser.newContext({ baseURL: baseUrl });
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

	const me = await fetch(`${baseUrl}/_emdash/api/auth/me`, {
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

export async function loginAsLocalDevAdmin(
	browser: Browser,
	baseUrl = LOCAL_RENTAL_BASE_URL,
): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext({ baseURL: baseUrl });
	const page = await context.newPage();

	await page.goto("/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin/", {
		waitUntil: "domcontentloaded",
	});

	await expect(page).toHaveURL(/\/_emdash\/admin\/?/);

	return { context, page };
}

export async function rentalRequestAt<T = unknown>(
	baseUrl: string,
	actor: RentalApiActor,
	method: "GET" | "POST",
	path: string,
	body?: unknown,
): Promise<ApiResult<T>> {
	const response =
		method === "GET"
			? await fetch(`${baseUrl}${path}`, {
					method,
					headers: {
						Cookie: actor.cookie,
					},
				})
			: await fetch(`${baseUrl}${path}`, {
					method,
					headers: {
						...RENTAL_JSON_HEADERS,
						Cookie: actor.cookie,
					},
					body: JSON.stringify(body ?? {}),
				});

	return {
		status: response.status,
		body: (await response.json()) as ApiBody<T>,
	};
}

export async function mustRentalRequestAt<T = unknown>(
	baseUrl: string,
	actor: RentalApiActor,
	method: "GET" | "POST",
	path: string,
	body?: unknown,
): Promise<T> {
	const result = await rentalRequestAt<T>(baseUrl, actor, method, path, body);

	if (result.status >= 400) {
		throw new Error(`${method} ${path} failed ${result.status}: ${JSON.stringify(result.body)}`);
	}

	if (!result.body.data) {
		throw new Error(`${method} ${path} returned no data: ${JSON.stringify(result.body)}`);
	}

	return result.body.data;
}

export async function rentalRequest<T = unknown>(
	actor: RentalApiActor,
	method: "GET" | "POST",
	path: string,
	body?: unknown,
): Promise<ApiResult<T>> {
	return rentalRequestAt<T>(LOCAL_RENTAL_BASE_URL, actor, method, path, body);
}

export async function mustRentalRequest<T = unknown>(
	actor: RentalApiActor,
	method: "GET" | "POST",
	path: string,
	body?: unknown,
): Promise<T> {
	return mustRentalRequestAt<T>(LOCAL_RENTAL_BASE_URL, actor, method, path, body);
}

export async function anonymousGetAt<T = unknown>(
	baseUrl: string,
	path: string,
): Promise<ApiResult<T>> {
	const response = await fetch(`${baseUrl}${path}`, {
		method: "GET",
	});

	return {
		status: response.status,
		body: (await response.json()) as ApiBody<T>,
	};
}

export async function anonymousPostAt<T = unknown>(
	baseUrl: string,
	path: string,
	body: unknown,
): Promise<ApiResult<T>> {
	const response = await fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: RENTAL_JSON_HEADERS,
		body: JSON.stringify(body),
	});

	return {
		status: response.status,
		body: (await response.json()) as ApiBody<T>,
	};
}

export async function anonymousGet<T = unknown>(path: string): Promise<ApiResult<T>> {
	return anonymousGetAt<T>(LOCAL_RENTAL_BASE_URL, path);
}

export async function anonymousPost<T = unknown>(
	path: string,
	body: unknown,
): Promise<ApiResult<T>> {
	return anonymousPostAt<T>(LOCAL_RENTAL_BASE_URL, path, body);
}

export async function createPublishedFlatViaApi(
	actor: RentalApiActor,
	options: CreatePublishedFlatOptions = {},
): Promise<PublishedFlatResult> {
	const baseUrl = options.baseUrl ?? LOCAL_RENTAL_BASE_URL;
	const title = options.title ?? uniqueRentalTitle("Habitat Mayflower API");
	const assetKind = options.assetKind ?? "flat";
	const locationLabel = options.locationLabel ?? "Bangalore";
	const publicPrice = options.publicPrice ?? 60000;
	const currency = options.currency ?? "INR";
	const minimumMonths = options.minimumMonths ?? 11;
	const configSpec = options.configSpec ?? {
		bedrooms: 2,
		furnishing: "semi_furnished",
	};
	const conditionSpec = options.conditionSpec ?? {
		walls: "freshly_painted",
	};
	const ownerConditionsSpec = options.ownerConditionsSpec ?? {
		depositPolicy: "Two months deposit covers chargeable damage.",
		documentsRequired: ["company_id", "salary_slip"],
	};
	const items = options.items ?? [
		{
			itemKind: "appliance",
			itemLabel: "Geyser",
			ownerDeclaredState: "working",
			itemSpec: {
				brand: "AO Smith",
				capacityLitres: 25,
			},
		},
	];

	const addData = await mustRentalRequestAt<{
		asset: Record<string, unknown>;
	}>(baseUrl, actor, "POST", "/api/rental/owner/assets/add", {
		assetKind,
		title,
		locationLabel,
		publicPrice,
		currency,
		ownerConditionsSpec,
	});

	const asset = addData.asset;

	await mustRentalRequestAt(baseUrl, actor, "POST", `/api/rental/owner/assets/${asset.id}/config`, {
		publicPrice,
		minimumMonths,
		configSpec,
		conditionSpec,
		items,
	});

	const publishedData = await mustRentalRequestAt<{
		asset: Record<string, unknown>;
	}>(baseUrl, actor, "POST", `/api/rental/owner/assets/${asset.id}/publish-to-marketplace`);

	expect(publishedData.asset.status).toBe("published");
	expect(publishedData.asset.business_state).toBe("listed");
	expect(publishedData.asset.visibility_state).toBe("marketplace");

	const publicList = await anonymousGetAt<{
	items: Array<Record<string, unknown>>;
}>(baseUrl, "/api/rental/marketplace/assets");

expect(
	publicList,
	`GET /api/rental/marketplace/assets failed: ${JSON.stringify(publicList.body, null, 2)}`,
).toMatchObject({ status: 200 });

expect(publicList.body.data?.items.some((item) => item.id === asset.id)).toBe(true);

	const publicDetails = await anonymousGetAt<{
	asset: Record<string, unknown>;
	ownerConditions: {
		version: number;
		hash: string;
		spec: Record<string, unknown>;
	};
}>(baseUrl, `/api/rental/marketplace/assets/${asset.id}`);

expect(
	publicDetails,
	`GET /api/rental/marketplace/assets/${asset.id} failed: ${JSON.stringify(
		publicDetails.body,
		null,
		2,
	)}`,
).toMatchObject({ status: 200 });

expect(publicDetails.body.data?.asset.id).toBe(asset.id);

	if (!publicDetails.body.data?.ownerConditions) {
		throw new Error(`Public details returned no ownerConditions: ${JSON.stringify(publicDetails.body)}`);
	}

	return {
		title,
		asset,
		publishedAsset: publishedData.asset,
		publicDetails: publicDetails.body.data,
		ownerConditions: publicDetails.body.data.ownerConditions,
	};
}

export async function createPublishedFlatThroughOwnerUi(
	page: Page,
	title: string,
): Promise<{ title: string; assetUrl: string }> {
	await page.goto("/owner/assets/new", { waitUntil: "domcontentloaded" });

	await expect(page.getByRole("heading", { name: "Asset config items" })).toBeVisible();

	await page.getByRole("button", { name: "Add starter flat inventory" }).click();
	await expect(page.locator(".inventory-row")).toHaveCount(14);

	await page.getByRole("button", { name: "Add row" }).click();
	await expect(page.locator(".inventory-row")).toHaveCount(15);

	await page.locator(".inventory-row").last().getByLabel("Item label").fill("Balcony grill");
	await page.locator(".inventory-row").last().getByLabel("Item kind").fill("fixture");
	await page.locator(".inventory-row").last().getByLabel("Room / group").fill("balcony");
	await page.locator(".inventory-row").last().getByLabel("Quantity").fill("1");
	await page.locator(".inventory-row").last().getByLabel("Owner declared state").fill("good");
	await page.locator(".inventory-row").last().getByLabel("Condition details").fill("Paint intact.");

	await page.getByRole("button", { name: "Add document" }).click();
	await page.locator(".document-row-editor").last().getByLabel("Document key").fill("hr_verification_email");
	await page.locator(".document-row-editor").last().getByLabel("Document name").fill("HR verification email");
	await page.locator(".document-row-editor").last().locator('select[name="required"]').selectOption("false");
	await page
		.locator(".document-row-editor")
		.last()
		.locator('select[name="attachmentRequired"]')
		.selectOption("false");
	await page
		.locator(".document-row-editor")
		.last()
		.getByLabel("Description")
		.fill("Free text or screenshot is accepted.");

	await page.getByLabel("Title").fill(title);
	await page.getByLabel("Location").fill("Bangalore");
	await page.getByLabel("Price").fill("60000");
	await page.getByRole("button", { name: "Create asset" }).click();

	await expect(page).toHaveURL(/\/marketplace\/assets\/[^/]+$/, { timeout: 15_000 });
	await expect(page.getByRole("heading", { name: title })).toBeVisible();
	await expect(page.getByText("status: published")).toBeVisible();
	await expect(page.getByText("listed", { exact: true })).toBeVisible();
	await expect(page.getByText("marketplace", { exact: true })).toBeVisible();
	await expect(page.getByText("This is your asset")).toBeVisible();
	await expect(page.getByRole("button", { name: "Express interest" })).toHaveCount(0);
	await expect(page.getByText("[\"company_id\"")).toHaveCount(0);

	return {
		title,
		assetUrl: page.url(),
	};
}

export function ownerAssetManagement(page: Page, title: string): Locator {
	return page.locator(".asset-management").filter({ hasText: title });
}

export function marketplaceAssetCard(page: Page, title: string): Locator {
	return page.locator(".asset-card").filter({ hasText: title });
}

export function ownerInboxItem(page: Page, title: string, tenantName: string): Locator {
	return page.locator(".inbox-item").filter({ hasText: title }).filter({ hasText: tenantName });
}