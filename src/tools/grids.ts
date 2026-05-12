import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WikiClient } from "../wiki-client.js";

export function registerGridTools(
  server: McpServer,
  client: WikiClient,
): void {
  server.registerTool(
    "get_page_grids",
    {
      description:
        "List dynamic tables (grids) embedded on a Yandex Wiki page.",
      inputSchema: z.object({
        pageId: z.string().describe("Numeric page ID"),
      }),
    },
    async ({ pageId }) => {
      const result = await client.getPageGrids(pageId);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "get_grid",
    {
      description:
        "Get a Yandex Wiki dynamic table (grid) with its columns and rows.",
      inputSchema: z.object({
        gridId: z.string().describe("Grid ID"),
        filter: z
          .string()
          .optional()
          .describe(
            "Filter expression over rows (e.g. column slug + operator: '~', '=', '>', '<')",
          ),
        sort: z.string().optional().describe("Sort expression"),
        onlyCols: z
          .string()
          .optional()
          .describe("Comma-separated column slugs to include"),
        onlyRows: z
          .string()
          .optional()
          .describe("Comma-separated row IDs to include"),
        revision: z
          .string()
          .optional()
          .describe("Specific grid revision to fetch"),
      }),
    },
    async ({ gridId, filter, sort, onlyCols, onlyRows, revision }) => {
      const result = await client.getGrid(gridId, {
        filter,
        sort,
        only_cols: onlyCols,
        only_rows: onlyRows,
        revision,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
