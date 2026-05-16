import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { APIRoute } from "astro";

export const prerender = false;

type SavedUser = {
id: string;
email: string;
name?: string | null;
role?: number | string | null;
};

type SavedActor = {
email: string;
name: string;
role: number;
status?: string;
inviteUrl?: string | null;
user?: SavedUser | null;
};

type SavedUsersFile = {
baseUrl?: string;
adminUser?: unknown;
owner?: SavedActor;
tenant?: SavedActor;
};

function json(data: unknown, status = 200): Response {
return Response.json(data, { status });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
const text = await request.text();

if (!text.trim()) {
return {};
}

const parsed = JSON.parse(text) as unknown;

if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
return {};
}

return parsed as Record<string, unknown>;
}

function getUsersFilePath(): string | null {
const sourceDir = dirname(fileURLToPath(import.meta.url));

const candidates = [
resolve(process.cwd(), ".local/rental-sandbox/users.json"),
resolve(process.cwd(), "../.local/rental-sandbox/users.json"),
resolve(process.cwd(), "../../.local/rental-sandbox/users.json"),
resolve(sourceDir, "../../../../../../.local/rental-sandbox/users.json"),
];

for (const candidate of candidates) {
if (existsSync(candidate)) {
return candidate;
}
}

return null;
}

function readSavedUsers(): SavedUsersFile {
const usersFilePath = getUsersFilePath();

if (!usersFilePath) {
throw new Error(
"Missing .local/rental-sandbox/users.json. Run scripts/create-rental-local-users.mjs, accept both invites, then rerun the script to sync user IDs.",
);
}

const raw = readFileSync(usersFilePath, "utf-8");
return JSON.parse(raw) as SavedUsersFile;
}

function findSavedUser(saved: SavedUsersFile, email: string): SavedUser | null {
const normalized = email.trim().toLowerCase();
const actors = [saved.owner, saved.tenant];

for (const actor of actors) {
if (actor?.email?.toLowerCase() === normalized) {
return actor.user ?? null;
}
}

return null;
}

export const POST: APIRoute = async ({ request, session }) => {
if (!import.meta.env.DEV) {
return json({ ok: false, error: { code: "FORBIDDEN", message: "DEV only" } }, 403);
}

const body = await readBody(request);
const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

if (!email) {
return json(
{ ok: false, error: { code: "VALIDATION_ERROR", message: "email is required" } },
400,
);
}

let user: SavedUser | null = null;

try {
const savedUsers = readSavedUsers();
user = findSavedUser(savedUsers, email);
} catch (error) {
return json(
{
ok: false,
error: {
code: "LOCAL_USERS_FILE_MISSING",
message: error instanceof Error ? error.message : "Could not read local users file",
},
},
500,
);
}

if (!user?.id) {
return json(
{
ok: false,
error: {
code: "USER_NOT_SYNCED",
message: `User ${email} is not synced into .local/rental-sandbox/users.json. Accept the invite, then rerun scripts/create-rental-local-users.mjs.`,
},
},
409,
);
}

session?.set("user", { id: user.id });

return json({
ok: true,
data: {
user,
},
});
};
