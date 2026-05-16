import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ session }) => {
session?.delete("user");
return Response.json({ ok: true, data: { loggedOut: true } });
};

export const GET: APIRoute = async ({ session, redirect }) => {
session?.delete("user");
return redirect("/");
};
