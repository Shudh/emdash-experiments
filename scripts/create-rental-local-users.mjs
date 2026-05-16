#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";

const BASE_URL = process.env.RENTAL_LOCAL_BASE_URL ?? "http://localhost:4444";
const OUT_DIR = ".local/rental-sandbox";
const OUT_FILE = `${OUT_DIR}/users.json`;

const OWNER = {
email: "owner_manual_created_1@example.com",
name: "Owner Manual Created 1",
role: 30,
};

const TENANT = {
email: "tenant_manual_created_1@example.com",
name: "Tenant Manual Created 1",
role: 30,
};

const INVITE_URL_REGEX = /https?:\/\/[^\s]+/;

function cookieFrom(response) {
const setCookie = response.headers.get("set-cookie");
if (!setCookie) return "";
const firstCookie = setCookie.split(",")[0];
return firstCookie.split(";")[0] ?? "";
}

async function sleep(ms) {
await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response) {
const text = await response.text();

try {
return text ? JSON.parse(text) : {};
} catch {
return { raw: text };
}
}

async function setupAdmin() {
const response = await fetch(`${BASE_URL}/_emdash/api/setup/dev-bypass?token=1`);
const body = await readJson(response);

if (!response.ok) {
throw new Error(`dev-bypass failed ${response.status}: ${JSON.stringify(body)}`);
}

const token = body?.data?.token ?? body?.token;

if (!token) {
throw new Error(`dev-bypass did not return token. Body: ${JSON.stringify(body)}`);
}

return {
token,
sessionCookie: cookieFrom(response),
user: body?.data?.user ?? body?.user ?? null,
};
}

function normalizeEmail(email) {
return String(email).trim().toLowerCase();
}

function normalizeUserRow(row) {
if (!row || typeof row !== "object") return null;

const id = typeof row.id === "string" ? row.id : null;
const email = typeof row.email === "string" ? row.email : null;

if (!id || !email) return null;

return {
id,
email,
name: typeof row.name === "string" ? row.name : null,
role: row.role ?? null,
};
}

function extractUsersFromBody(body) {
const candidateLists = [
body?.data?.items,
body?.data?.users,
body?.items,
body?.users,
Array.isArray(body?.data) ? body.data : null,
];

for (const candidate of candidateLists) {
if (Array.isArray(candidate)) {
return candidate;
}
}

return [];
}

async function findRegisteredUser(admin, email) {
const url = new URL(`${BASE_URL}/_emdash/api/admin/users`);
url.searchParams.set("search", email);
url.searchParams.set("limit", "50");

const response = await fetch(url, {
headers: {
Authorization: `Bearer ${admin.token}`,
},
});

const body = await readJson(response);

if (!response.ok) {
throw new Error(`admin users lookup failed ${response.status}: ${JSON.stringify(body)}`);
}

const users = extractUsersFromBody(body);
const normalizedEmail = normalizeEmail(email);

for (const row of users) {
const user = normalizeUserRow(row);
if (user && normalizeEmail(user.email) === normalizedEmail) {
return user;
}
}

return null;
}

async function clearDevEmails(admin) {
const response = await fetch(`${BASE_URL}/_emdash/api/dev/emails`, {
method: "DELETE",
headers: {
"X-EmDash-Request": "1",
Cookie: admin.sessionCookie,
Authorization: `Bearer ${admin.token}`,
},
});

if (!response.ok) {
const body = await readJson(response);
throw new Error(`clear dev emails failed ${response.status}: ${JSON.stringify(body)}`);
}
}

async function readLatestInviteFromDevEmails(admin) {
let lastBody = null;

for (let attempt = 1; attempt <= 10; attempt += 1) {
const response = await fetch(`${BASE_URL}/_emdash/api/dev/emails`, {
headers: {
Authorization: `Bearer ${admin.token}`,
},
});

const body = await readJson(response);
lastBody = body;

if (!response.ok) {
throw new Error(`dev emails failed ${response.status}: ${JSON.stringify(body)}`);
}

const emails = body?.data?.items ?? [];
const latestEmail = emails[0];
const text = latestEmail?.message?.text ?? "";
const match = text.match(INVITE_URL_REGEX);

if (match) {
return match[0];
}

await sleep(500);
}

throw new Error(
`Could not find invite URL in dev email. Expected body.data.items[0].message.text. Last body: ${JSON.stringify(lastBody)}`,
);
}

async function createInvite(admin, actor) {
await clearDevEmails(admin);

const response = await fetch(`${BASE_URL}/_emdash/api/auth/invite`, {
method: "POST",
headers: {
"Content-Type": "application/json",
"X-EmDash-Request": "1",
Authorization: `Bearer ${admin.token}`,
},
body: JSON.stringify({
email: actor.email,
role: actor.role,
}),
});

const body = await readJson(response);

if (response.ok) {
const inviteUrl = body?.data?.inviteUrl ?? (await readLatestInviteFromDevEmails(admin));

return {
status: "invite_created",
inviteUrl,
};
}

if (response.status === 409 && body?.error?.code === "USER_EXISTS") {
const registeredUser = await findRegisteredUser(admin, actor.email);

if (registeredUser) {
return {
status: "registered",
inviteUrl: null,
user: registeredUser,
};
}

throw new Error(
`Invite said USER_EXISTS for ${actor.email}, but admin users lookup did not return the user. Body: ${JSON.stringify(body)}`,
);
}

throw new Error(`invite failed for ${actor.email} ${response.status}: ${JSON.stringify(body)}`);
}

async function resolveActor(admin, actor) {
const registeredUser = await findRegisteredUser(admin, actor.email);

if (registeredUser) {
return {
email: actor.email,
name: actor.name,
role: actor.role,
status: "registered",
inviteUrl: null,
user: registeredUser,
};
}

const inviteResult = await createInvite(admin, actor);

return {
email: actor.email,
name: actor.name,
role: actor.role,
status: inviteResult.status,
inviteUrl: inviteResult.inviteUrl ?? null,
user: inviteResult.user ?? null,
};
}

async function main() {
const admin = await setupAdmin();

const owner = await resolveActor(admin, OWNER);
const tenant = await resolveActor(admin, TENANT);

await mkdir(OUT_DIR, { recursive: true });

const result = {
baseUrl: BASE_URL,
adminUser: admin.user,
owner,
tenant,
};

await writeFile(OUT_FILE, JSON.stringify(result, null, 2));

console.log("");
console.log("Owner:");
console.log(owner);
console.log("");
console.log("Tenant:");
console.log(tenant);
console.log("");
console.log(`Saved: ${OUT_FILE}`);
console.log("");

if (owner.status === "registered" && tenant.status === "registered") {
console.log("Both users are registered and synced into users.json.");
return;
}

console.log("Open invite URLs manually in Chrome for actors with status invite_created.");
console.log("After accepting invites, rerun this script once to sync real user IDs.");
}

main().catch((error) => {
console.error(error);
process.exit(1);
});
