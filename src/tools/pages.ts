import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WikiClient } from "../wiki-client.js";
import type {
  CreatePageParams,
  MovePageParams,
  UpdatePageParams,
} from "../types.js";

export interface PageToolsOptions {
  defaultParentSlug?: string;
}

const fieldsSchema = z
  .array(z.enum(["attributes", "breadcrumbs", "content", "redirect"]))
  .optional()
  .describe(
    "Which extra fields to include. Common: 'content' (Markdown body), 'attributes' (meta), 'breadcrumbs'.",
  );

export function registerPageTools(
  server: McpServer,
  client: WikiClient,
  options: PageToolsOptions = {},
): void {
  const { defaultParentSlug } = options;
  const parentDefaultNote = defaultParentSlug
    ? ` Default parent slug is "${defaultParentSlug}" — when the user does not name a parent, OMIT this field and the server will use the default.`
    : "";

  server.registerTool(
    "get_page",
    {
      description:
        "Get a Yandex Wiki page by its slug (URL-friendly path, e.g. 'team/onboarding'). " +
        "Returns title, Markdown content and metadata. Set fields=['content','attributes'] to include body and meta.",
      inputSchema: z.object({
        slug: z.string().describe("Page slug, e.g. 'team/onboarding'"),
        fields: fieldsSchema,
      }),
    },
    async ({ slug, fields }) => {
      const page = await client.getPageBySlug(slug, fields);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_page_by_id",
    {
      description:
        "Get a Yandex Wiki page by its numeric ID. Returns title, Markdown content and metadata.",
      inputSchema: z.object({
        pageId: z.string().describe("Numeric page ID"),
        fields: fieldsSchema,
      }),
    },
    async ({ pageId, fields }) => {
      const page = await client.getPageById(pageId, fields);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_descendants",
    {
      description:
        "List direct child pages by parent slug. Pass empty slug for root pages. Use cursor for pagination.",
      inputSchema: z.object({
        slug: z
          .string()
          .describe("Parent slug. Use empty string '' to list root pages."),
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor from previous response (next_cursor)"),
        pageSize: z
          .number()
          .optional()
          .describe("Page size, max 50"),
        q: z
          .string()
          .optional()
          .describe("Filter descendants by title substring"),
      }),
    },
    async ({ slug, cursor, pageSize, q }) => {
      const result = await client.getDescendantsBySlug(slug, {
        cursor,
        page_size: pageSize,
        q,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "create_page",
    {
      description:
        "Create a new Yandex Wiki page. Content is Markdown (Yandex Flavored Markdown). " +
        "Specify the parent via parentSlug or parentId." +
        parentDefaultNote,
      inputSchema: z.object({
        title: z.string().describe("Page title"),
        content: z
          .string()
          .optional()
          .describe("Markdown body of the page"),
        parentSlug: z
          .string()
          .optional()
          .describe(
            defaultParentSlug
              ? `Parent page slug. Optional — defaults to "${defaultParentSlug}".`
              : "Parent page slug (where to place the new page)",
          ),
        parentId: z
          .string()
          .optional()
          .describe("Parent page numeric ID (alternative to parentSlug)"),
        slug: z
          .string()
          .optional()
          .describe(
            "Custom slug segment for the new page. If omitted, derived from title.",
          ),
        pageType: z
          .enum(["doc", "grid"])
          .optional()
          .describe("Page type. Default: 'doc' (Markdown document)."),
      }),
    },
    async ({ title, content, parentSlug, parentId, slug, pageType }) => {
      const params: CreatePageParams = { title };
      if (content !== undefined) params.content = content;
      if (parentId) {
        params.parent_id = parentId;
      } else if (parentSlug !== undefined) {
        params.parent_slug = parentSlug;
      } else if (defaultParentSlug) {
        params.parent_slug = defaultParentSlug;
      }
      if (slug) params.slug = slug;
      if (pageType) params.page_type = pageType;
      const page = await client.createPage(params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
      };
    },
  );

  server.registerTool(
    "update_page",
    {
      description:
        "Update an existing Yandex Wiki page. Pass only fields you want to change. " +
        "Content is full Markdown body (replaces existing).",
      inputSchema: z.object({
        pageId: z.string().describe("Numeric page ID to update"),
        title: z.string().optional().describe("New page title"),
        content: z.string().optional().describe("New Markdown body (replaces existing)"),
      }),
    },
    async ({ pageId, title, content }) => {
      const params: UpdatePageParams = {};
      if (title !== undefined) params.title = title;
      if (content !== undefined) params.content = content;
      const page = await client.updatePage(pageId, params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
      };
    },
  );

  server.registerTool(
    "move_page",
    {
      description:
        "Move a Yandex Wiki page to a new parent and/or rename its slug.",
      inputSchema: z.object({
        pageId: z.string().describe("Numeric page ID to move"),
        newParentSlug: z.string().optional().describe("New parent slug"),
        newParentId: z.string().optional().describe("New parent numeric ID"),
        newSlug: z.string().optional().describe("New slug segment for the page"),
      }),
    },
    async ({ pageId, newParentSlug, newParentId, newSlug }) => {
      const params: MovePageParams = {};
      if (newParentId) params.new_parent_id = newParentId;
      else if (newParentSlug !== undefined) params.new_parent_slug = newParentSlug;
      if (newSlug) params.new_slug = newSlug;
      const page = await client.movePage(pageId, params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
      };
    },
  );
}
