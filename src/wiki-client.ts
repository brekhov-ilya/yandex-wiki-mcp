import type {
  WikiClientConfig,
  WikiPage,
  WikiDescendantsResponse,
  WikiResourcesResponse,
  WikiGrid,
  CreatePageParams,
  UpdatePageParams,
  MovePageParams,
} from "./types.js";

const BASE_URL = "https://api.wiki.yandex.net/v1";

export interface DescendantsQuery {
  cursor?: string;
  page_size?: number;
  q?: string;
}

export interface ResourcesQuery {
  types?: string;
  q?: string;
  order_by?: string;
  order_direction?: "asc" | "desc";
  cursor?: string;
  page_size?: number;
}

export interface GridQuery {
  filter?: string;
  sort?: string;
  only_cols?: string;
  only_rows?: string;
  revision?: string;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export class WikiClient {
  private readonly token: string;
  private readonly orgHeader: Record<string, string>;

  constructor(config: WikiClientConfig) {
    this.token = config.token;

    if (config.orgId) {
      this.orgHeader = { "X-Org-ID": config.orgId };
    } else if (config.cloudOrgId) {
      this.orgHeader = { "X-Cloud-Org-ID": config.cloudOrgId };
    } else {
      throw new Error("Either orgId or cloudOrgId must be provided");
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;

    const headers: Record<string, string> = {
      Authorization: `OAuth ${this.token}`,
      ...this.orgHeader,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const sentBody = body !== undefined ? JSON.stringify(body) : "";
      const sentSuffix = sentBody ? ` | request body: ${sentBody}` : "";
      throw new Error(
        `Wiki API error ${response.status} on ${method} ${path}: ${errorBody}${sentSuffix}`,
      );
    }

    // Some endpoints (e.g. PATCH) may return an empty body
    const text = await response.text();
    if (!text) {
      return undefined as unknown as T;
    }
    return JSON.parse(text) as T;
  }

  async getPageBySlug(slug: string, fields?: string[]): Promise<WikiPage> {
    const query = buildQuery({
      slug,
      fields: fields && fields.length > 0 ? fields.join(",") : undefined,
    });
    return this.request<WikiPage>("GET", `/pages${query}`);
  }

  async getPageById(pageId: string, fields?: string[]): Promise<WikiPage> {
    const query = buildQuery({
      fields: fields && fields.length > 0 ? fields.join(",") : undefined,
    });
    return this.request<WikiPage>(
      "GET",
      `/pages/${encodeURIComponent(pageId)}${query}`,
    );
  }

  async getDescendantsBySlug(
    slug: string,
    opts: DescendantsQuery = {},
  ): Promise<WikiDescendantsResponse> {
    if (!slug || !slug.trim()) {
      throw new Error(
        "getDescendantsBySlug: 'slug' must be non-empty. Wiki API rejects empty slug with FORCED_SYNC_REQUIRED.",
      );
    }
    const query = buildQuery({ slug, ...opts });
    return this.request<WikiDescendantsResponse>(
      "GET",
      `/pages/descendants${query}`,
    );
  }

  async getDescendantsById(
    pageId: string,
    opts: DescendantsQuery = {},
  ): Promise<WikiDescendantsResponse> {
    const query = buildQuery({ ...opts });
    return this.request<WikiDescendantsResponse>(
      "GET",
      `/pages/${encodeURIComponent(pageId)}/descendants${query}`,
    );
  }

  async createPage(params: CreatePageParams): Promise<WikiPage> {
    return this.request<WikiPage>("POST", `/pages`, params);
  }

  async updatePage(
    pageId: string,
    params: UpdatePageParams,
  ): Promise<WikiPage> {
    return this.request<WikiPage>(
      "PATCH",
      `/pages/${encodeURIComponent(pageId)}`,
      params,
    );
  }

  async movePage(
    pageId: string,
    params: MovePageParams,
  ): Promise<WikiPage> {
    return this.request<WikiPage>(
      "POST",
      `/pages/${encodeURIComponent(pageId)}/move`,
      params,
    );
  }

  async getPageResources(
    pageId: string,
    opts: ResourcesQuery = {},
  ): Promise<WikiResourcesResponse> {
    const query = buildQuery({ ...opts });
    return this.request<WikiResourcesResponse>(
      "GET",
      `/pages/${encodeURIComponent(pageId)}/resources${query}`,
    );
  }

  async getPageGrids(pageId: string): Promise<unknown> {
    return this.request<unknown>(
      "GET",
      `/pages/${encodeURIComponent(pageId)}/grids`,
    );
  }

  async getGrid(gridId: string, opts: GridQuery = {}): Promise<WikiGrid> {
    const query = buildQuery({ ...opts });
    return this.request<WikiGrid>(
      "GET",
      `/grids/${encodeURIComponent(gridId)}${query}`,
    );
  }
}
