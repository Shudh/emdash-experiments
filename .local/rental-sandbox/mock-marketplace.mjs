import http from "node:http";

const server = http.createServer((request, response) => {
response.setHeader("Content-Type", "application/json");
response.end(JSON.stringify({ ok: true, path: request.url, items: [] }));
});

server.listen(4445, "127.0.0.1", () => {
console.log("Mock marketplace ready at http://127.0.0.1:4445");
});
