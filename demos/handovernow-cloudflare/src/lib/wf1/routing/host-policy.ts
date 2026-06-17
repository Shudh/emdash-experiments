const TEST_LANE_HOSTNAME = "cms.handovernow.com";

function hostnameFromRequest(request: Request): string {
	try {
		return new URL(request.url).hostname.toLowerCase();
	} catch {
		return "";
	}
}

function isLocalHostname(hostname: string): boolean {
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

export function isAllowedTestLaneHost(request: Request): boolean {
	const hostname = hostnameFromRequest(request);

	if (hostname === TEST_LANE_HOSTNAME) {
		return true;
	}

	if (isLocalHostname(hostname)) {
		return true;
	}

	return false;
}

export function applyTestLaneNoStoreHeaders(headers: Headers): void {
	headers.set("cache-control", "no-store, no-cache, max-age=0, must-revalidate");
	headers.set("pragma", "no-cache");
	headers.set("expires", "0");
	headers.set("x-robots-tag", "noindex, nofollow");
}

export function testLaneHostRejectionResponse(request: Request): Response | null {
	if (isAllowedTestLaneHost(request)) {
		return null;
	}

	return new Response("Not found", {
		status: 404,
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store",
			"x-robots-tag": "noindex, nofollow",
		},
	});
}