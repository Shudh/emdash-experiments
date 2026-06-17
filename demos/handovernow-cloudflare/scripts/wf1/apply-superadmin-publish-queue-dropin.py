#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Could not find expected block for {label}. Stop and inspect manually.")
    return text.replace(old, new, 1)


def patch_handler() -> None:
    path = "src/lib/wf1/api/handler.ts"
    text = read(path)

    if 'from "../commands/marketplace-review.js"' not in text:
        text = replace_once(
            text,
            'import { publishWorkflowAsset } from "../commands/publish-asset.js";\n',
            'import {\n\tapproveMarketplaceReview,\n\trejectMarketplaceReview,\n\trequestMarketplaceReview,\n} from "../commands/marketplace-review.js";\nimport { publishWorkflowAsset } from "../commands/publish-asset.js";\n',
            "handler marketplace review command imports",
        )

    if 'from "../queries/admin-publish-queue.js"' not in text:
        text = replace_once(
            text,
            'import { getWorkflowOwnerDashboard } from "../queries/owner-dashboard.js";\n',
            'import { getWorkflowOwnerDashboard } from "../queries/owner-dashboard.js";\nimport { listAdminPublishQueue } from "../queries/admin-publish-queue.js";\n',
            "handler admin publish queue import",
        )

    owner_dashboard_route = '''\t\tif (input.request.method === "GET" && input.path === "owner/dashboard") {
\t\t\treturn jsonOk(await getWorkflowOwnerDashboard(input.store, user, { lane }));
\t\t}
'''

    admin_get_route = '''\t\tif (input.request.method === "GET" && input.path === "owner/dashboard") {
\t\t\treturn jsonOk(await getWorkflowOwnerDashboard(input.store, user, { lane }));
\t\t}

\t\tif (input.request.method === "GET" && input.path === "admin/publish-queue") {
\t\t\treturn jsonOk(
\t\t\t\tawait listAdminPublishQueue(input.store, user, {
\t\t\t\t\tlane,
\t\t\t\t\tlimit: numberQueryParam(input.request, "limit", 100, MAX_WF1_INDEX_LIMIT),
\t\t\t\t}),
\t\t\t);
\t\t}
'''

    if 'input.path === "admin/publish-queue"' not in text:
        text = replace_once(text, owner_dashboard_route, admin_get_route, "handler admin publish queue route")

    publish_route = '''\t\t\tif (parts[3] === "publish-to-marketplace") {
\t\t\t\treturn jsonOk(await publishWorkflowAsset(input.store, user, parts[2]));
\t\t\t}
'''

    request_and_publish_route = '''\t\t\tif (parts[3] === "request-marketplace-review") {
\t\t\t\treturn jsonOk(
\t\t\t\t\tawait requestMarketplaceReview(input.store, user, parts[2], {
\t\t\t\t\t\tlane,
\t\t\t\t\t\tsummary: asOptionalString(body.summary),
\t\t\t\t\t\trequestSpec: optionalRecord(body, "requestSpec"),
\t\t\t\t\t}),
\t\t\t\t\t201,
\t\t\t\t);
\t\t\t}

\t\t\tif (parts[3] === "publish-to-marketplace") {
\t\t\t\treturn jsonOk(await publishWorkflowAsset(input.store, user, parts[2]));
\t\t\t}
'''

    if 'parts[3] === "request-marketplace-review"' not in text:
        text = replace_once(text, publish_route, request_and_publish_route, "handler request marketplace review route")

    marketplace_interest_anchor = '''\t\tif (
\t\t\tinput.request.method === "POST" &&
\t\t\tparts[0] === "marketplace" &&
'''

    admin_post_routes = '''\t\tif (
\t\t\tinput.request.method === "POST" &&
\t\t\tparts[0] === "admin" &&
\t\t\tparts[1] === "assets" &&
\t\t\tparts[2]
\t\t) {
\t\t\tif (parts[3] === "approve-marketplace") {
\t\t\t\treturn jsonOk(
\t\t\t\t\tawait approveMarketplaceReview(input.store, user, parts[2], {
\t\t\t\t\t\tlane,
\t\t\t\t\t}),
\t\t\t\t);
\t\t\t}

\t\t\tif (parts[3] === "reject-marketplace") {
\t\t\t\treturn jsonOk(
\t\t\t\t\tawait rejectMarketplaceReview(input.store, user, parts[2], {
\t\t\t\t\t\tlane,
\t\t\t\t\t\treason: asOptionalString(body.reason),
\t\t\t\t\t\treviewSpec: optionalRecord(body, "reviewSpec"),
\t\t\t\t\t}),
\t\t\t\t);
\t\t\t}
\t\t}

'''

    if 'parts[3] === "approve-marketplace"' not in text:
        text = replace_once(text, marketplace_interest_anchor, admin_post_routes + marketplace_interest_anchor, "handler admin review action routes")

    write(path, text)
    print(f"patched {path}")


def patch_owner_dashboard() -> None:
    path = "src/pages/test-corridor/wf1/owner/index.astro"
    text = read(path)

    text = text.replace(
        'action={`/test-corridor/api/wf1-rental/owner/assets/${assetId}/publish-to-marketplace`}',
        'action={`/test-corridor/api/wf1-rental/owner/assets/${assetId}/request-marketplace-review`}',
    )
    text = text.replace(
        '<button class="rental-button" type="submit">Publish to marketplace</button>',
        '<button class="rental-button" type="submit">Request marketplace review</button>',
    )

    if 'href="/test-corridor/wf1/admin/publish-queue"' not in text:
        text = replace_once(
            text,
            '<a class="rental-button" href="/test-corridor/wf1/owner/assets/new">Create asset</a>',
            '<div class="asset-links">\n\t\t\t\t\t<a class="rental-button secondary" href="/test-corridor/wf1/admin/publish-queue">Review queue</a>\n\t\t\t\t\t<a class="rental-button" href="/test-corridor/wf1/owner/assets/new">Create asset</a>\n\t\t\t\t</div>',
            "owner dashboard review queue link",
        )

    write(path, text)
    print(f"patched {path}")


def patch_test_asset_create_page() -> None:
    path = "src/pages/test-corridor/wf1/owner/assets/new.astro"
    text = read(path)

    text = text.replace("Publish to marketplace", "Request marketplace review")
    text = text.replace("publish-to-marketplace", "request-marketplace-review")

    write(path, text)
    print(f"patched {path}")


def main() -> None:
    patch_handler()
    patch_owner_dashboard()
    patch_test_asset_create_page()
    print("Superadmin publish queue drop-in patch complete.")


if __name__ == "__main__":
    main()
