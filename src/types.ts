export interface WikiClientConfig {
  token: string;
  orgId?: string;
  cloudOrgId?: string;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface YandexTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthConfig {
  clientId: string;
  forceAuth: boolean;
}

export type WikiPageType = "doc" | "grid";

export interface WikiPageAttributes {
  comments_count?: number;
  comments_enabled?: boolean;
  created_at?: string;
  modified_at?: string;
  lang?: string;
  is_readonly?: boolean;
  is_collaborative?: boolean;
  is_draft?: boolean;
  [key: string]: unknown;
}

export interface WikiPage {
  id: string;
  page_type?: WikiPageType | string;
  slug?: string;
  title?: string;
  content?: string;
  attributes?: WikiPageAttributes;
  redirect?: unknown;
  [key: string]: unknown;
}

export interface WikiDescendantsResponse {
  pages?: WikiPage[];
  next_cursor?: string | null;
  prev_cursor?: string | null;
  [key: string]: unknown;
}

export interface WikiResource {
  type: string;
  id: string;
  name?: string;
  title?: string;
  size?: number;
  mimetype?: string;
  download_url?: string;
  created_at?: string;
  has_preview?: boolean;
  [key: string]: unknown;
}

export interface WikiResourcesResponse {
  resources?: WikiResource[];
  next_cursor?: string | null;
  prev_cursor?: string | null;
  [key: string]: unknown;
}

export interface WikiGridColumn {
  slug: string;
  title?: string;
  type?: string;
  [key: string]: unknown;
}

export interface WikiGridRow {
  id: string;
  cells: Record<string, { value: unknown } | unknown>;
  [key: string]: unknown;
}

export interface WikiGrid {
  id: string;
  title?: string;
  revision?: string;
  rich_text_format?: boolean;
  structure?: WikiGridColumn[];
  rows?: WikiGridRow[];
  [key: string]: unknown;
}

export interface CreatePageParams {
  title: string;
  content?: string;
  parent_slug?: string;
  parent_id?: string;
  slug?: string;
  page_type?: WikiPageType;
}

export interface UpdatePageParams {
  title?: string;
  content?: string;
}

export interface MovePageParams {
  new_parent_slug?: string;
  new_parent_id?: string;
  new_slug?: string;
}

export type FieldsParam =
  | "attributes"
  | "breadcrumbs"
  | "content"
  | "redirect";
