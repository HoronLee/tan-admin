import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createFileRoute } from "@tanstack/react-router";
import { handleMcpRequest } from "#/lib/mcp/handler";

const server = new McpServer({
	name: "tan-servora",
	version: "1.0.0",
});

export const Route = createFileRoute("/mcp")({
	server: {
		handlers: {
			POST: async ({ request }) => handleMcpRequest(request, server),
		},
	},
});
