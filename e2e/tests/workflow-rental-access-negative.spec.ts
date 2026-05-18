import { expect, test } from "@playwright/test";

import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";
import {
	WORKFLOW_RENTAL_BASE_URL,
	loginAsWorkflowRentalUser,
} from "../workflow-rental-flow-utils.js";

test("workflow rental rejects anonymous mutations", async ({ browser }) => {
	const owner = await loginAsWorkflowRentalUser(browser, RENTAL_LOCAL_USERS.owner.email);
	try {
		const response = await fetch(`${WORKFLOW_RENTAL_BASE_URL}/api/wf-rental/owner/assets/add`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-EmDash-Request": "1",
			},
			body: JSON.stringify({ assetKind: "flat", title: "Anonymous Workflow Asset" }),
		});
		expect(response.status).toBe(401);
		const csrf = await fetch(`${WORKFLOW_RENTAL_BASE_URL}/api/wf-rental/owner/assets/add`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: owner.cookie,
			},
			body: JSON.stringify({ assetKind: "flat", title: "Missing CSRF Workflow Asset" }),
		});
		expect(csrf.status).toBe(403);
	} finally {
		await owner.context.close();
	}
});
