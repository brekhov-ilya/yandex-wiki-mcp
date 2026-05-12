import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WikiClient } from "../wiki-client.js";

export function registerResourceTools(
  server: McpServer,
  client: WikiClient,
): void {
  server.registerTool(
    "get_page_resources",
    {
      description:
        "List resources attached to a Yandex Wiki page (attachments, SharePoint docs, grids).",
      inputSchema: z.object({
        pageId: z.string().describe("Numeric page ID"),
        types: z
          .string()
          .optional()
          .describe(
            "Comma-separated resource types to include: 'attachment', 'sharepoint', 'grid'",
          ),
        q: z.string().optional().describe("Filter resources by name substring"),
        orderBy: z
          .string()
          .optional()
          .describe("Sort field, e.g. 'created_at'"),
        orderDirection: z.enum(["asc", "desc"]).optional(),
        cursor: z.string().optional().describe("Pagination cursor"),
        pageSize: z.number().optional().describe("Page size, max 50"),
      }),
    },
    async ({ pageId, types, q, orderBy, orderDirection, cursor, pageSize }) => {
      const result = await client.getPageResources(pageId, {
        types,
        q,
        order_by: orderBy,
        order_direction: orderDirection,
        cursor,
        page_size: pageSize,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
