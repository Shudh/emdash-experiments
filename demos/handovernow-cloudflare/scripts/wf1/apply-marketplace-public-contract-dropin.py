#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

MARKETPLACE_TS = 'import {\n\tfilterAssetsForLane,\n\tisAssetVisibleInLane,\n\ttype Wf1Lane,\n} from "../routing/lane.js";\nimport type { DomainRow, DomainStore, UserContext } from "../../domain/types.js";\nimport { asString } from "../../domain/types.js";\nimport {\n\tWF_ASSET_STATE,\n\tWF_STATUS,\n\tWF_VISIBILITY,\n\tWORKFLOW_RENTAL_COLLECTIONS,\n} from "../store/collections.js";\nimport { actorRoleFor } from "../store/repository.js";\nimport {\n\tmarketplaceApplicationContextForAsset,\n\tpublicMarketplaceAssetForAsset,\n\tpublicOwnerConditionsForAsset,\n\ttype MarketplaceViewer,\n\ttype MarketplaceViewerRelationship,\n} from "./marketplace-public-shape.js";\n\nexport type MarketplaceQueryOptions = {\n\tlane?: Wf1Lane;\n};\n\nexport async function listWorkflowMarketplaceAssets(\n\tstore: DomainStore,\n\tuser: UserContext | null,\n\toptions: MarketplaceQueryOptions = {},\n) {\n\tconst lane = options.lane ?? "public";\n\n\tconst assets = await store.list(\n\t\tWORKFLOW_RENTAL_COLLECTIONS.ASSETS,\n\t\t{\n\t\t\tstatus: WF_STATUS.PUBLISHED,\n\t\t\tbusiness_state: WF_ASSET_STATE.LISTED,\n\t\t\tvisibility_state: WF_VISIBILITY.MARKETPLACE,\n\t\t},\n\t\t{ orderBy: "published_at", direction: "desc", limit: 100 },\n\t);\n\n\tconst visibleAssets = filterAssetsForLane(assets, lane);\n\n\treturn Promise.all(visibleAssets.map((asset) => withViewer(store, user, asset)));\n}\n\nexport async function getWorkflowMarketplaceAsset(\n\tstore: DomainStore,\n\tuser: UserContext | null,\n\tassetId: string,\n\toptions: MarketplaceQueryOptions = {},\n) {\n\tconst asset = await store.get(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId);\n\tif (!asset) return null;\n\n\tconst lane = options.lane ?? "public";\n\n\tif (!isAssetVisibleInLane(asset, lane)) {\n\t\treturn null;\n\t}\n\n\tconst interest = user\n\t\t? await store.findOne(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS, {\n\t\t\t\tasset_id: asset.id,\n\t\t\t\tinterested_user_id: user.id,\n\t\t\t})\n\t\t: null;\n\n\tconst workflowInstance = interest\n\t\t? await findWorkflowInstanceForInterest(store, interest.id)\n\t\t: null;\n\n\tconst role = actorRoleFor(user, asset, interest);\n\tconst isPublic =\n\t\tasset.status === WF_STATUS.PUBLISHED &&\n\t\tasset.business_state === WF_ASSET_STATE.LISTED &&\n\t\tasset.visibility_state === WF_VISIBILITY.MARKETPLACE;\n\n\tif (!isPublic && role !== "owner" && role !== "applicant" && role !== "renter") {\n\t\treturn null;\n\t}\n\n\treturn {\n\t\tasset: publicMarketplaceAssetForAsset(\n\t\t\tasset,\n\t\t\tviewerForAsset(asset, role, interest, workflowInstance),\n\t\t),\n\t\townerConditions: publicOwnerConditionsForAsset(asset),\n\t\tapplication: marketplaceApplicationContextForAsset(asset),\n\t};\n}\n\nasync function withViewer(store: DomainStore, user: UserContext | null, asset: DomainRow) {\n\tconst interest = user\n\t\t? await store.findOne(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS, {\n\t\t\t\tasset_id: asset.id,\n\t\t\t\tinterested_user_id: user.id,\n\t\t\t})\n\t\t: null;\n\n\tconst workflowInstance = interest\n\t\t? await findWorkflowInstanceForInterest(store, interest.id)\n\t\t: null;\n\n\treturn publicMarketplaceAssetForAsset(\n\t\tasset,\n\t\tviewerForAsset(asset, actorRoleFor(user, asset, interest), interest, workflowInstance),\n\t);\n}\n\nasync function findWorkflowInstanceForInterest(\n\tstore: DomainStore,\n\tinterestId: string,\n): Promise<DomainRow | null> {\n\treturn store.findOne(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES, {\n\t\tinterest_id: interestId,\n\t});\n}\n\nfunction viewerForAsset(\n\tasset: DomainRow,\n\trole: string,\n\tinterest: DomainRow | null,\n\tworkflowInstance: DomainRow | null,\n): MarketplaceViewer {\n\tconst canExpressInterest =\n\t\trole !== "anonymous" &&\n\t\trole !== "owner" &&\n\t\trole !== "applicant" &&\n\t\trole !== "renter" &&\n\t\t!interest;\n\n\tconst relationship: MarketplaceViewerRelationship =\n\t\trole === "owner"\n\t\t\t? "owner"\n\t\t\t: role === "renter"\n\t\t\t\t? "renter"\n\t\t\t\t: role === "applicant" && interest\n\t\t\t\t\t? "interested_applicant"\n\t\t\t\t\t: role === "anonymous"\n\t\t\t\t\t\t? "anonymous"\n\t\t\t\t\t\t: "logged_in";\n\n\tif (relationship === "owner") {\n\t\treturn {\n\t\t\trelationship,\n\t\t\trole,\n\t\t\tcanExpressInterest: false,\n\t\t\tmessage: "This is your asset",\n\t\t};\n\t}\n\n\tif (relationship === "renter") {\n\t\treturn {\n\t\t\trelationship,\n\t\t\trole,\n\t\t\tcanExpressInterest: false,\n\t\t\tinterestId: interest?.id ?? asString(asset.active_interest_id),\n\t\t\tinterestState: asString(interest?.interest_state),\n\t\t\tworkflowInstanceId: workflowInstance?.id ?? asString(asset.active_workflow_instance_id),\n\t\t\tmessage: "You are the tenant for this asset",\n\t\t};\n\t}\n\n\tif (relationship === "interested_applicant") {\n\t\treturn {\n\t\t\trelationship,\n\t\t\trole,\n\t\t\tcanExpressInterest: false,\n\t\t\tinterestId: interest?.id ?? "",\n\t\t\tinterestState: asString(interest?.interest_state),\n\t\t\tworkflowInstanceId: workflowInstance?.id ?? "",\n\t\t};\n\t}\n\n\tif (relationship === "anonymous") {\n\t\treturn {\n\t\t\trelationship,\n\t\t\trole,\n\t\t\tcanExpressInterest: false,\n\t\t};\n\t}\n\n\treturn {\n\t\trelationship,\n\t\trole,\n\t\tcanExpressInterest,\n\t};\n}\n'
PUBLIC_SHAPE_TS = 'import type { DomainRow } from "../../domain/types.js";\nimport { asNumber, asString } from "../../domain/types.js";\n\ntype JsonObject = Record<string, unknown>;\n\nexport type MarketplaceViewerRelationship =\n\t| "anonymous"\n\t| "owner"\n\t| "applicant"\n\t| "renter"\n\t| "interested_applicant"\n\t| "logged_in";\n\nexport type MarketplaceViewer = {\n\trelationship: MarketplaceViewerRelationship;\n\trole: string;\n\tcanExpressInterest: boolean;\n\tmessage?: string;\n\tinterestId?: string;\n\tinterestState?: string;\n\tworkflowInstanceId?: string;\n};\n\ntype PublicMedia = {\n\turl: string;\n\tfilename: string;\n\tmimeType: string;\n\tkind: string;\n\tisImage: boolean;\n};\n\nconst PUBLIC_CONFIG_KEYS = new Set([\n\t"bedrooms",\n\t"bathrooms",\n\t"balconies",\n\t"furnishing",\n\t"propertyType",\n\t"property_type",\n\t"builtUpAreaSqft",\n\t"built_up_area_sqft",\n\t"carpetAreaSqft",\n\t"carpet_area_sqft",\n\t"superBuiltUpSqft",\n\t"super_built_up_sqft",\n\t"floor",\n\t"totalFloors",\n\t"total_floors",\n\t"facing",\n\t"parking",\n\t"availableFrom",\n\t"available_from",\n\t"propertyAge",\n\t"property_age",\n\t"kitchen",\n]);\n\nconst PUBLIC_OWNER_CONDITION_KEYS = new Set([\n\t"depositPolicy",\n\t"deposit_policy",\n\t"maintenancePolicy",\n\t"maintenance_policy",\n\t"petPolicy",\n\t"pet_policy",\n\t"paintingPolicy",\n\t"painting_policy",\n\t"moveInPolicy",\n\t"move_in_policy",\n\t"moveOutPolicy",\n\t"move_out_policy",\n\t"utilityPolicy",\n\t"utility_policy",\n\t"houseRules",\n\t"house_rules",\n\t"notes",\n\t"documentsRequired",\n\t"documents_required",\n]);\n\nconst PUBLIC_QUESTION_KINDS = new Set([\n\t"text",\n\t"textarea",\n\t"phone",\n\t"email",\n\t"date",\n\t"number",\n\t"single_choice",\n]);\n\nfunction isObjectRecord(value: unknown): value is JsonObject {\n\treturn value !== null && typeof value === "object" && Array.isArray(value) === false;\n}\n\nfunction objectValue(value: unknown): JsonObject {\n\tif (isObjectRecord(value)) return value;\n\n\tif (typeof value === "string" && value.trim() !== "") {\n\t\ttry {\n\t\t\tconst parsed = JSON.parse(value);\n\t\t\treturn isObjectRecord(parsed) ? parsed : {};\n\t\t} catch {\n\t\t\treturn {};\n\t\t}\n\t}\n\n\treturn {};\n}\n\nfunction stringOrNull(value: unknown): string | null {\n\tif (typeof value !== "string") return null;\n\tconst trimmed = value.trim();\n\treturn trimmed === "" ? null : trimmed;\n}\n\nfunction numberOrNull(value: unknown): number | null {\n\tif (typeof value === "number" && Number.isFinite(value)) return value;\n\n\tif (typeof value === "string" && value.trim() !== "") {\n\t\tconst parsed = Number(value);\n\t\treturn Number.isFinite(parsed) ? parsed : null;\n\t}\n\n\treturn null;\n}\n\nfunction booleanOrNull(value: unknown): boolean | null {\n\tif (typeof value === "boolean") return value;\n\treturn null;\n}\n\nfunction safeScalar(value: unknown): string | number | boolean | null | undefined {\n\treturn stringOrNull(value) ?? numberOrNull(value) ?? booleanOrNull(value) ?? undefined;\n}\n\nfunction safeScalarArray(value: unknown): Array<string | number | boolean> | undefined {\n\tif (!Array.isArray(value)) return undefined;\n\n\tconst normalized = value\n\t\t.map((entry) => safeScalar(entry))\n\t\t.filter((entry): entry is string | number | boolean => entry !== undefined && entry !== null);\n\n\treturn normalized.length ? normalized : undefined;\n}\n\nfunction safeDisplayValue(value: unknown): string | number | boolean | Array<string | number | boolean> | undefined {\n\tconst scalar = safeScalar(value);\n\n\tif (scalar !== undefined && scalar !== null) {\n\t\treturn scalar;\n\t}\n\n\tconst scalarArray = safeScalarArray(value);\n\n\tif (scalarArray !== undefined) {\n\t\treturn scalarArray;\n\t}\n\n\treturn undefined;\n}\n\nfunction storageKeyToMediaUrl(storageKey: string): string {\n\treturn `/_emdash/api/media/file/${storageKey\n\t\t.split("/")\n\t\t.map((part) => encodeURIComponent(part))\n\t\t.join("/")}`;\n}\n\nfunction publicMediaFrom(value: unknown): PublicMedia | null {\n\tif (!isObjectRecord(value)) return null;\n\n\tconst rawUrl = stringOrNull(value.url);\n\tconst rawStorageKey = stringOrNull(value.storageKey) ?? stringOrNull(value.storage_key);\n\tconst url = rawUrl ?? (rawStorageKey ? storageKeyToMediaUrl(rawStorageKey) : null);\n\n\tif (!url) return null;\n\n\tconst mimeType = stringOrNull(value.mimeType) ?? stringOrNull(value.mime_type) ?? "";\n\tconst filename = stringOrNull(value.filename) ?? stringOrNull(value.name) ?? "Asset media";\n\tconst kind = stringOrNull(value.kind) ?? "asset_media";\n\n\treturn {\n\t\turl,\n\t\tfilename,\n\t\tmimeType,\n\t\tkind,\n\t\tisImage: mimeType.startsWith("image/"),\n\t};\n}\n\nfunction uniqueMedia(items: PublicMedia[]): PublicMedia[] {\n\tconst seen = new Set<string>();\n\tconst result: PublicMedia[] = [];\n\n\tfor (const item of items) {\n\t\tif (seen.has(item.url)) continue;\n\t\tseen.add(item.url);\n\t\tresult.push(item);\n\t}\n\n\treturn result;\n}\n\nexport function publicMediaForAsset(asset: DomainRow): PublicMedia[] {\n\tconst config = objectValue(asset.config_spec);\n\tconst refs: unknown[] = [];\n\n\tif (config.thumbnailMediaRef) refs.push(config.thumbnailMediaRef);\n\n\tif (Array.isArray(config.mediaRefs)) {\n\t\trefs.push(...config.mediaRefs);\n\t}\n\n\treturn uniqueMedia(\n\t\trefs\n\t\t\t.map((entry) => publicMediaFrom(entry))\n\t\t\t.filter((entry): entry is PublicMedia => entry !== null),\n\t);\n}\n\nexport function publicConfigForAsset(asset: DomainRow): JsonObject {\n\tconst config = objectValue(asset.config_spec);\n\tconst publicConfig: JsonObject = {};\n\n\tfor (const [key, value] of Object.entries(config)) {\n\t\tif (!PUBLIC_CONFIG_KEYS.has(key)) continue;\n\n\t\tconst safeValue = safeDisplayValue(value);\n\n\t\tif (safeValue !== undefined) {\n\t\t\tpublicConfig[key] = safeValue;\n\t\t}\n\t}\n\n\treturn publicConfig;\n}\n\nexport function publicConditionForAsset(asset: DomainRow): JsonObject {\n\tconst condition = objectValue(asset.condition_spec);\n\tconst publicCondition: JsonObject = {};\n\n\tfor (const [key, value] of Object.entries(condition)) {\n\t\tconst safeValue = safeDisplayValue(value);\n\n\t\tif (safeValue !== undefined) {\n\t\t\tpublicCondition[key] = safeValue;\n\t\t}\n\t}\n\n\treturn publicCondition;\n}\n\nfunction publicDocumentRequirement(value: unknown): JsonObject | string | null {\n\tif (typeof value === "string" && value.trim() !== "") return value.trim();\n\n\tif (!isObjectRecord(value)) return null;\n\n\tconst result: JsonObject = {};\n\tconst label = stringOrNull(value.label) ?? stringOrNull(value.key);\n\tconst description = stringOrNull(value.description);\n\tconst required = typeof value.required === "boolean" ? value.required : undefined;\n\tconst attachmentRequired =\n\t\ttypeof value.attachmentRequired === "boolean"\n\t\t\t? value.attachmentRequired\n\t\t\t: typeof value.attachment_required === "boolean"\n\t\t\t\t? value.attachment_required\n\t\t\t\t: undefined;\n\n\tif (label) result.label = label;\n\tif (description) result.description = description;\n\tif (required !== undefined) result.required = required;\n\tif (attachmentRequired !== undefined) result.attachmentRequired = attachmentRequired;\n\n\treturn Object.keys(result).length ? result : null;\n}\n\nfunction publicDocuments(value: unknown): Array<JsonObject | string> | undefined {\n\tif (!Array.isArray(value)) return undefined;\n\n\tconst documents = value\n\t\t.map((entry) => publicDocumentRequirement(entry))\n\t\t.filter((entry): entry is JsonObject | string => entry !== null);\n\n\treturn documents.length ? documents : undefined;\n}\n\nexport function publicOwnerConditionsForAsset(asset: DomainRow): { spec: JsonObject } {\n\tconst spec = objectValue(asset.owner_conditions_spec);\n\tconst publicSpec: JsonObject = {};\n\n\tfor (const [key, value] of Object.entries(spec)) {\n\t\tif (!PUBLIC_OWNER_CONDITION_KEYS.has(key)) continue;\n\n\t\tif (key === "documentsRequired" || key === "documents_required") {\n\t\t\tconst documents = publicDocuments(value);\n\t\t\tif (documents !== undefined) {\n\t\t\t\tpublicSpec.documentsRequired = documents;\n\t\t\t}\n\t\t\tcontinue;\n\t\t}\n\n\t\tconst safeValue = safeDisplayValue(value);\n\n\t\tif (safeValue !== undefined) {\n\t\t\tpublicSpec[key] = safeValue;\n\t\t}\n\t}\n\n\treturn { spec: publicSpec };\n}\n\nfunction normalizedQuestionKind(value: unknown): string {\n\tconst kind = stringOrNull(value) ?? "text";\n\treturn PUBLIC_QUESTION_KINDS.has(kind) ? kind : "text";\n}\n\nfunction normalizedQuestion(value: unknown): JsonObject | null {\n\tif (!isObjectRecord(value)) return null;\n\n\tconst key = stringOrNull(value.key);\n\tconst label = stringOrNull(value.label);\n\n\tif (!key || !label) return null;\n\n\tconst question: JsonObject = {\n\t\tkey,\n\t\tlabel,\n\t\tkind: normalizedQuestionKind(value.kind),\n\t\trequired: value.required === false ? false : true,\n\t};\n\n\tconst target = stringOrNull(value.target);\n\tconst placeholder = stringOrNull(value.placeholder);\n\tconst options = safeScalarArray(value.options)?.map(String) ?? [];\n\n\tif (target) question.target = target;\n\tif (placeholder) question.placeholder = placeholder;\n\tif (options.length) question.options = options;\n\n\treturn question;\n}\n\nfunction normalizedPrescreenQuestions(asset: DomainRow): JsonObject[] {\n\tconst spec = objectValue(asset.owner_conditions_spec);\n\tconst rawQuestions = Array.isArray(spec.preScreenQuestions) ? spec.preScreenQuestions : [];\n\n\treturn rawQuestions\n\t\t.map((entry) => normalizedQuestion(entry))\n\t\t.filter((entry): entry is JsonObject => entry !== null);\n}\n\nexport function marketplaceApplicationContextForAsset(asset: DomainRow): JsonObject {\n\treturn {\n\t\tacceptedConditionsVersion: asNumber(asset.conditions_version, 0),\n\t\tacceptedConditionsHash: asString(asset.conditions_hash),\n\t\tprescreenQuestions: normalizedPrescreenQuestions(asset),\n\t};\n}\n\nexport function publicMarketplaceAssetForAsset(asset: DomainRow, viewer: MarketplaceViewer): JsonObject {\n\tconst media = publicMediaForAsset(asset);\n\tconst thumbnail = media[0] ?? null;\n\n\treturn {\n\t\tid: asset.id,\n\t\tslug: asString(asset.slug),\n\t\tstatus: asString(asset.status),\n\t\ttitle: asString(asset.title, "Untitled asset"),\n\t\tasset_kind: asString(asset.asset_kind, "asset"),\n\t\tlocation_label: asset.location_label ?? null,\n\t\tpublic_price: numberOrNull(asset.public_price),\n\t\tcurrency: asString(asset.currency, "INR"),\n\t\tminimum_months: numberOrNull(asset.minimum_months),\n\t\tbusiness_state: asString(asset.business_state),\n\t\tvisibility_state: asString(asset.visibility_state),\n\t\tpublished_at: asset.published_at ?? null,\n\t\tcreated_at: asset.created_at,\n\t\tupdated_at: asset.updated_at,\n\t\tconfig_spec: publicConfigForAsset(asset),\n\t\tcondition_spec: publicConditionForAsset(asset),\n\t\tthumbnail,\n\t\tphotos: media.filter((entry) => entry.isImage),\n\t\tmedia,\n\t\tviewer,\n\t};\n}\n'
CONDITION_BOX_ASTRO = '---\ninterface Props {\n\tconditions?: {\n\t\tversion?: unknown;\n\t\thash?: unknown;\n\t\tspec?: Record<string, unknown> | null;\n\t} | null;\n}\n\nconst { conditions } = Astro.props;\nconst spec = conditions?.spec && typeof conditions.spec === "object" ? conditions.spec : {};\nconst CAMEL_BOUNDARY_PATTERN = /([a-z])([A-Z])/g;\nconst documentsValue =\n\t"documentsRequired" in spec ? spec.documentsRequired : "documents_required" in spec ? spec.documents_required : [];\nconst documentRows = Array.isArray(documentsValue) ? documentsValue : [];\nconst conditionRows = Object.entries(spec).filter(\n\t([key, value]) =>\n\t\tkey !== "documentsRequired" &&\n\t\tkey !== "documents_required" &&\n\t\tkey !== "preScreenQuestions" &&\n\t\tkey !== "pre_screen_questions" &&\n\t\tisDisplayValue(value),\n);\nconst versionLabel =\n\tconditions?.version !== undefined && conditions?.version !== null && String(conditions.version).trim() !== ""\n\t\t? `v${String(conditions.version)}`\n\t\t: "";\n\nfunction labelFor(key: string) {\n\treturn key.replaceAll("_", " ").replaceAll(CAMEL_BOUNDARY_PATTERN, "$1 $2");\n}\n\nfunction isDisplayValue(value: unknown): boolean {\n\tif (typeof value === "string") return value.trim() !== "";\n\tif (typeof value === "number") return Number.isFinite(value);\n\tif (typeof value === "boolean") return true;\n\tif (Array.isArray(value)) {\n\t\treturn value.every((entry) => typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean");\n\t}\n\treturn false;\n}\n\nfunction displayValue(value: unknown): string {\n\tif (Array.isArray(value)) {\n\t\treturn value.map((entry) => String(entry)).join(", ");\n\t}\n\n\treturn String(value);\n}\n\nfunction documentKey(document: unknown, index: number) {\n\tif (document && typeof document === "object") {\n\t\treturn String((document as Record<string, unknown>).key ?? (document as Record<string, unknown>).label ?? index);\n\t}\n\treturn String(document);\n}\n\nfunction documentLabel(document: unknown) {\n\tif (document && typeof document === "object") {\n\t\tconst entry = document as Record<string, unknown>;\n\t\treturn String(entry.label ?? entry.key ?? "Document");\n\t}\n\treturn labelFor(String(document));\n}\n\nfunction documentMeta(document: unknown) {\n\tif (!document || typeof document !== "object") return [];\n\tconst entry = document as Record<string, unknown>;\n\treturn [\n\t\tentry.required === false ? "optional" : "required",\n\t\tentry.attachmentRequired || entry.attachment_required ? "attachment required" : "free text accepted",\n\t\tentry.acceptedFileTypes ? `accepted: ${String(entry.acceptedFileTypes)}` : "",\n\t].filter(Boolean);\n}\n\nfunction documentDescription(document: unknown) {\n\tif (!document || typeof document !== "object") return "";\n\tconst description = (document as Record<string, unknown>).description;\n\treturn typeof description === "string" ? description : "";\n}\n---\n\n<section class="condition-box rental-panel">\n\t<div class="condition-head">\n\t\t<div>\n\t\t\t<p class="rental-kicker">Owner conditions</p>\n\t\t\t<h2>Current terms to accept</h2>\n\t\t</div>\n\t\t{versionLabel ? <span class="rental-badge">{versionLabel}</span> : null}\n\t</div>\n\t{\n\t\tconditionRows.length || documentRows.length ? (\n\t\t\t<div class="condition-body">\n\t\t\t\t{conditionRows.length ? (\n\t\t\t\t\t<ul>\n\t\t\t\t{conditionRows.map(([key, value]) => (\n\t\t\t\t\t<li>\n\t\t\t\t\t\t<strong>{labelFor(key)}:</strong>{" "}\n\t\t\t\t\t\t<span>{displayValue(value)}</span>\n\t\t\t\t\t</li>\n\t\t\t\t))}\n\t\t\t\t\t</ul>\n\t\t\t\t) : null}\n\t\t\t\t{documentRows.length ? (\n\t\t\t\t\t<div class="documents-list" aria-label="Document requirements">\n\t\t\t\t\t\t{documentRows.map((document, index) => (\n\t\t\t\t\t\t\t<article class="document-row">\n\t\t\t\t\t\t\t\t\t<div>\n\t\t\t\t\t\t\t\t\t\t<strong>{documentLabel(document)}</strong>\n\t\t\t\t\t\t\t\t\t\t{documentDescription(document) ? (\n\t\t\t\t\t\t\t\t\t\t\t<p>{documentDescription(document)}</p>\n\t\t\t\t\t\t\t\t\t\t) : null}\n\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t<div class="rental-badges">\n\t\t\t\t\t\t\t\t\t{documentMeta(document).map((meta) => (\n\t\t\t\t\t\t\t\t\t\t<span class="rental-badge">{meta}</span>\n\t\t\t\t\t\t\t\t\t))}\n\t\t\t\t\t\t\t\t\t<span class="rental-badge">{documentKey(document, index)}</span>\n\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t</article>\n\t\t\t\t\t\t))}\n\t\t\t\t\t</div>\n\t\t\t\t) : null}\n\t\t\t</div>\n\t\t) : (\n\t\t\t<p class="rental-muted">No owner conditions have been added.</p>\n\t\t)\n\t}\n</section>\n\n<style>\n\t.condition-box {\n\t\tdisplay: grid;\n\t\tgap: 16px;\n\t}\n\n\t.condition-head {\n\t\tdisplay: flex;\n\t\talign-items: start;\n\t\tjustify-content: space-between;\n\t\tgap: 16px;\n\t}\n\n\t.condition-box h2 {\n\t\tfont-size: 1.2rem;\n\t}\n\n\t.condition-box ul {\n\t\tdisplay: grid;\n\t\tgap: 10px;\n\t\tmargin: 0;\n\t\tpadding-left: 18px;\n\t}\n\n\t.condition-box strong {\n\t\ttext-transform: capitalize;\n\t}\n\n\t.condition-body {\n\t\tdisplay: grid;\n\t\tgap: 14px;\n\t}\n\n\t.documents-list {\n\t\tdisplay: grid;\n\t\tgap: 10px;\n\t}\n\n\t.document-row {\n\t\tdisplay: grid;\n\t\tgrid-template-columns: minmax(0, 1fr) auto;\n\t\tgap: 12px;\n\t\tborder: 1px solid var(--r-border);\n\t\tborder-radius: var(--r-radius);\n\t\tpadding: 12px;\n\t\tbackground: var(--r-bg);\n\t}\n\n\t.document-row p {\n\t\tmargin: 4px 0 0;\n\t\tcolor: var(--r-muted);\n\t}\n\n\t@media (max-width: 640px) {\n\t\t.condition-head,\n\t\t.document-row {\n\t\t\tgrid-template-columns: 1fr;\n\t\t\tdisplay: grid;\n\t\t}\n\t}\n</style>\n'


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Could not find expected block for {label}. Stop and inspect manually.")
    return text.replace(old, new, 1)


def replace_function_until(text: str, function_name: str, next_function_name: str, replacement: str, label: str) -> str:
    start = text.find(f"function {function_name}(")
    end = text.find(f"function {next_function_name}(", start + 1)

    if start == -1 or end == -1:
        raise SystemExit(f"Could not find expected function range for {label}. Stop and inspect manually.")

    return text[:start] + replacement.rstrip() + "\n\n" + text[end:]


def strip_old_dom_hide_script(text: str) -> str:
    return re.sub(
        r"\n*<script\s+is:inline\s+data-hn-hide-technical-asset-config-v2>.*?</script>\n*",
        "\n",
        text,
        flags=re.DOTALL,
    )


def patch_marketplace_query_contract() -> None:
    write("src/lib/wf1/queries/marketplace-public-shape.ts", PUBLIC_SHAPE_TS)
    write("src/lib/wf1/queries/marketplace.ts", MARKETPLACE_TS)
    print("patched src/lib/wf1/queries/marketplace-public-shape.ts")
    print("patched src/lib/wf1/queries/marketplace.ts")


def patch_condition_box() -> None:
    write("src/components/rental/ConditionBox.astro", CONDITION_BOX_ASTRO)
    print("patched src/components/rental/ConditionBox.astro")


def media_helpers_for_detail_page() -> str:
    return """
function mediaArrayFor(asset: JsonObject | undefined): Array<JsonObject> {
\tconst candidates: unknown[] = [];

\tif (isObjectRecord(asset?.thumbnail)) {
\t\tcandidates.push(asset.thumbnail);
\t}

\tif (Array.isArray(asset?.photos)) {
\t\tcandidates.push(...asset.photos);
\t}

\tif (Array.isArray(asset?.media)) {
\t\tcandidates.push(...asset.media);
\t}

\treturn candidates.filter((entry): entry is JsonObject => isObjectRecord(entry));
}

function thumbnailFor(asset: JsonObject | undefined) {
\tconst media = mediaArrayFor(asset)[0] ?? null;

\tif (!media) return null;

\tconst url = typeof media.url === "string" && media.url.trim() !== "" ? media.url.trim() : "";

\tif (!url) return null;

\treturn {
\t\turl,
\t\tmimeType: String(media.mimeType ?? ""),
\t\tfilename: String(media.filename ?? "Asset media"),
\t};
}
"""


def media_helpers_for_index_page() -> str:
    return """
function mediaArrayFor(asset: AssetRow): Array<Record<string, unknown>> {
\tconst candidates: unknown[] = [];

\tif (asset.thumbnail && typeof asset.thumbnail === "object" && !Array.isArray(asset.thumbnail)) {
\t\tcandidates.push(asset.thumbnail);
\t}

\tif (Array.isArray(asset.photos)) {
\t\tcandidates.push(...asset.photos);
\t}

\tif (Array.isArray(asset.media)) {
\t\tcandidates.push(...asset.media);
\t}

\treturn candidates.filter(
\t\t(entry): entry is Record<string, unknown> =>
\t\t\tentry !== null && typeof entry === "object" && !Array.isArray(entry),
\t);
}

function thumbnailFor(asset: AssetRow) {
\tconst media = mediaArrayFor(asset)[0] ?? null;

\tif (!media) return null;

\tconst url = typeof media.url === "string" && media.url.trim() !== "" ? media.url.trim() : "";

\tif (!url) return null;

\treturn {
\t\turl,
\t\tmimeType: String(media.mimeType ?? ""),
\t\tfilename: String(media.filename ?? "Asset media"),
\t};
}
"""


def patch_detail_page() -> None:
    path = "src/pages/test-corridor/wf1/marketplace/assets/[id].astro"
    text = strip_old_dom_hide_script(read(path))

    if "application?: JsonObject | null;" not in text:
        text = replace_once(
            text,
            """type AssetDetails = {
\tasset?: JsonObject;
\townerConditions?: OwnerConditions | null;
};
""",
            """type AssetDetails = {
\tasset?: JsonObject;
\townerConditions?: OwnerConditions | null;
\tapplication?: JsonObject | null;
};
""",
            "detail AssetDetails application field",
        )

    if "const rawApplication = value.application;" not in text:
        text = replace_once(
            text,
            """\tconst rawAsset = value.asset;
\tconst rawOwnerConditions = value.ownerConditions;

\treturn {
\t\tasset: isObjectRecord(rawAsset) ? rawAsset : undefined,
\t\townerConditions: normalizeOwnerConditions(rawOwnerConditions),
\t};
}
""",
            """\tconst rawAsset = value.asset;
\tconst rawOwnerConditions = value.ownerConditions;
\tconst rawApplication = value.application;

\treturn {
\t\tasset: isObjectRecord(rawAsset) ? rawAsset : undefined,
\t\townerConditions: normalizeOwnerConditions(rawOwnerConditions),
\t\tapplication: isObjectRecord(rawApplication) ? rawApplication : undefined,
\t};
}
""",
            "detail normalize application field",
        )

    text = replace_function_until(
        text,
        "mediaUrlFromStorageKey",
        "assetIdForRoute",
        media_helpers_for_detail_page(),
        "detail safe media helpers",
    )

    if "const application = isObjectRecord(details?.application)" not in text:
        text = replace_once(
            text,
            """const details = await loadDetails();
const asset = details?.asset;
const ownerConditions = details?.ownerConditions;
const viewer = isObjectRecord(asset?.viewer) ? asset.viewer : {};
""",
            """const details = await loadDetails();
const asset = details?.asset;
const ownerConditions = details?.ownerConditions;
const application = isObjectRecord(details?.application) ? details.application : {};
const viewer = isObjectRecord(asset?.viewer) ? asset.viewer : {};
""",
            "detail application constant",
        )

    if "const chatbotifyOwnerConditions: OwnerConditions" not in text:
        text = replace_once(
            text,
            """const ownerConditionVersion = numberValue(ownerConditions?.version, 0);
const ownerConditionHash = stringValue(ownerConditions?.hash);
const prescreenStartedAt = new Date().toISOString();
""",
            """const ownerConditionVersion = numberValue(application.acceptedConditionsVersion, 0);
const ownerConditionHash = stringValue(application.acceptedConditionsHash);
const prescreenQuestions = Array.isArray(application.prescreenQuestions) ? application.prescreenQuestions : [];
const chatbotifyOwnerConditions: OwnerConditions = {
\tversion: ownerConditionVersion,
\thash: ownerConditionHash,
\tspec: {
\t\tpreScreenQuestions: prescreenQuestions,
\t},
};
const prescreenStartedAt = new Date().toISOString();
""",
            "detail application acceptance constants",
        )

    text = text.replace(
        "ownerConditions={ownerConditions}",
        "ownerConditions={chatbotifyOwnerConditions}",
    )

    write(path, text)
    print(f"patched {path}")


def patch_index_page() -> None:
    path = "src/pages/test-corridor/wf1/marketplace/index.astro"
    text = read(path)

    text = replace_function_until(
        text,
        "mediaUrlFromStorageKey",
        "assetIdFor",
        media_helpers_for_index_page(),
        "marketplace index safe media helpers",
    )

    write(path, text)
    print(f"patched {path}")


def main() -> None:
    patch_marketplace_query_contract()
    patch_condition_box()
    patch_detail_page()
    patch_index_page()
    print("Marketplace public API contract drop-in complete.")


if __name__ == "__main__":
    main()
