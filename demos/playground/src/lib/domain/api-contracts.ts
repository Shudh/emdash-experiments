import { z } from "zod";

import { DomainError } from "./types.js";

const jsonObjectSchema = z.record(z.string(), z.unknown());
const optionalJsonObjectSchema = jsonObjectSchema.optional();
const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected finite number");

function parseSchema<T>(schema: z.ZodType<T>, body: unknown): T {
	const result = schema.safeParse(body);
	if (result.success) return result.data;
	const message = result.error.issues
		.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
		.join("; ");
	throw new DomainError("VALIDATION_ERROR", message || "Invalid request body", 400);
}

export const assetConfigItemInputSchema = z.object({
	itemKind: z.string().trim().min(1),
	itemGroup: z.string().trim().min(1).optional(),
	itemLabel: z.string().trim().min(1),
	ownerDeclaredState: z.string().trim().min(1).optional(),
	mediaRefs: z.array(z.unknown()).optional(),
	itemSpec: optionalJsonObjectSchema,
});

export const addAssetRequestSchema = z.object({
	assetKind: z.string().trim().min(1),
	title: z.string().trim().min(1),
	locationLabel: z.string().trim().min(1).optional(),
	publicPrice: finiteNumberSchema.optional(),
	currency: z.string().trim().min(1).default("INR"),
	ownerConditionsSpec: optionalJsonObjectSchema,
});

export type AddAssetRequest = z.infer<typeof addAssetRequestSchema>;

export function parseAddAssetRequest(body: unknown): AddAssetRequest {
	return parseSchema(addAssetRequestSchema, body);
}

export const updateAssetConfigRequestSchema = z.object({
	publicPrice: finiteNumberSchema.optional(),
	currency: z.string().trim().min(1).optional(),
	minimumMonths: finiteNumberSchema.optional(),
	includedKm: finiteNumberSchema.optional(),
	featuredImage: z.string().trim().min(1).optional(),
	galleryImages: z.array(jsonObjectSchema).optional(),
	configSpec: optionalJsonObjectSchema,
	conditionSpec: optionalJsonObjectSchema,
	ownerConditionsSpec: optionalJsonObjectSchema,
	items: z.array(assetConfigItemInputSchema).default([]),
});

export type UpdateAssetConfigRequest = z.infer<typeof updateAssetConfigRequestSchema>;
export type AssetConfigItemInput = z.infer<typeof assetConfigItemInputSchema>;

export function parseUpdateAssetConfigRequest(body: unknown): UpdateAssetConfigRequest {
	return parseSchema(updateAssetConfigRequestSchema, body);
}

export const expressInterestRequestSchema = z.object({
	name: z.string().trim().min(1).optional(),
	officialEmail: z.string().trim().min(1).optional(),
	phone: z.string().trim().min(1).optional(),
	employerName: z.string().trim().min(1).optional(),
	offeredPrice: finiteNumberSchema.optional(),
	requestedStartDate: z.string().trim().min(1).optional(),
	requestedMinimumMonths: finiteNumberSchema.optional(),
	requestedKmLimit: finiteNumberSchema.optional(),
	message: z.string().trim().min(1).optional(),
	interestSpec: optionalJsonObjectSchema,
	acceptedConditionsVersion: finiteNumberSchema.optional(),
	acceptedConditionsHash: z.string().trim().min(1).optional(),
});

export type ExpressInterestRequest = z.infer<typeof expressInterestRequestSchema>;

export function parseExpressInterestRequest(body: unknown): ExpressInterestRequest {
	return parseSchema(expressInterestRequestSchema, body);
}

export const addNegotiationRoundRequestSchema = z.object({
	roundPhase: z.string().trim().min(1),
	roundKind: z.string().trim().min(1),
	roundState: z.string().trim().min(1).optional(),
	price: finiteNumberSchema.optional(),
	currency: z.string().trim().min(1).optional(),
	minimumMonths: finiteNumberSchema.optional(),
	kmLimit: finiteNumberSchema.optional(),
	depositAmount: finiteNumberSchema.optional(),
	startDate: z.string().trim().min(1).optional(),
	endDate: z.string().trim().min(1).optional(),
	message: z.string().trim().min(1).optional(),
	proposedPatch: optionalJsonObjectSchema,
	termsSpec: optionalJsonObjectSchema,
});

export type AddNegotiationRoundRequest = z.infer<typeof addNegotiationRoundRequestSchema>;

export function parseAddNegotiationRoundRequest(body: unknown): AddNegotiationRoundRequest {
	return parseSchema(addNegotiationRoundRequestSchema, body);
}

export const acceptFinalTermsRequestSchema = z.object({
	acceptedRoundId: z.string().trim().min(1).optional(),
	agreementKind: z.string().trim().min(1).default("rental"),
	effectiveFrom: z.string().trim().min(1).optional(),
	effectiveTo: z.string().trim().min(1).optional(),
	contractText: z.string().trim().min(1).optional(),
	extraTerms: optionalJsonObjectSchema,
});

export type AcceptFinalTermsRequest = z.infer<typeof acceptFinalTermsRequestSchema>;

export function parseAcceptFinalTermsRequest(body: unknown): AcceptFinalTermsRequest {
	return parseSchema(acceptFinalTermsRequestSchema, body);
}

export const signAgreementRequestSchema = z.object({
	signatureSpec: optionalJsonObjectSchema,
	notarizationSpec: optionalJsonObjectSchema,
});

export type SignAgreementRequest = z.infer<typeof signAgreementRequestSchema>;

export function parseSignAgreementRequest(body: unknown): SignAgreementRequest {
	return parseSchema(signAgreementRequestSchema, body);
}

export const startHandoverRequestSchema = z.object({
	handoverKind: z.string().trim().min(1),
	baselineHandoverId: z.string().trim().min(1).optional(),
	summarySpec: optionalJsonObjectSchema,
});

export type StartHandoverRequest = z.infer<typeof startHandoverRequestSchema>;

export function parseStartHandoverRequest(body: unknown): StartHandoverRequest {
	return parseSchema(startHandoverRequestSchema, body);
}

export const claimHandoverDamageRequestSchema = z.object({
	handoverItemCheckId: z.string().trim().min(1),
	ownerClaimedState: z.string().trim().min(1),
	observedState: z.string().trim().min(1).optional(),
	estimatedRepairCost: finiteNumberSchema.optional(),
	message: z.string().trim().min(1).optional(),
	proposedPatch: optionalJsonObjectSchema,
});

export type ClaimHandoverDamageRequest = z.infer<typeof claimHandoverDamageRequestSchema>;

export function parseClaimHandoverDamageRequest(body: unknown): ClaimHandoverDamageRequest {
	return parseSchema(claimHandoverDamageRequestSchema, body);
}

export const settleHandoverRequestSchema = z.object({
	settlementSpec: optionalJsonObjectSchema,
});

export type SettleHandoverRequest = z.infer<typeof settleHandoverRequestSchema>;

export function parseSettleHandoverRequest(body: unknown): SettleHandoverRequest {
	return parseSchema(settleHandoverRequestSchema, body);
}
