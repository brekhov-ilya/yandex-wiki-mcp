#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { WikiClient } from "./wiki-client.js";
import { resolveToken } from "./auth.js";
import { registerPageTools } from "./tools/pages.js";
import { registerResourceTools } from "./tools/resources.js";
import { registerGridTools } from "./tools/grids.js";

const DEFAULT_CLIENT_ID = "74e48aa0cc7c492b8a296c5d17f2cfd7";
const DEFAULT_HTTP_PORT = 3000;
const DEFAULT_HTTP_HOST = "0.0.0.0";

interface CliArgs {
  orgId?: string;
  cloudOrgId?: string;
  clientId: string;
  forceAuth: boolean;
  transport: "stdio" | "http";
  port: number;
  host: string;
  token?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let orgId: string | undefined;
  let cloudOrgId: string | undefined;
  let clientId: string = DEFAULT_CLIENT_ID;
  let forceAuth = false;
  let transport: "stdio" | "http" = "stdio";
  let port: number = DEFAULT_HTTP_PORT;
  let host: string = DEFAULT_HTTP_HOST;
  let token: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--org-id" && args[i + 1]) {
      orgId = args[++i];
    } else if (args[i] === "--cloud-org-id" && args[i + 1]) {
      cloudOrgId = args[++i];
    } else if (args[i] === "--client-id" && args[i + 1]) {
      clientId = args[++i];
    } else if (args[i] === "--auth") {
      forceAuth = true;
    } else if (args[i] === "--transport" && args[i + 1]) {
      const value = args[++i];
      if (value !== "stdio" && value !== "http") {
        process.stderr.write(
          `Error: --transport must be "stdio" or "http", got "${value}".\n`,
        );
        process.exit(1);
      }
      transport = value;
    } else if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[++i], 10);
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        process.stderr.write(
          "Error: --port must be a valid port number (1-65535).\n",
        );
        process.exit(1);
      }
    } else if (args[i] === "--host" && args[i + 1]) {
      host = args[++i];
    } else if (args[i] === "--token" && args[i + 1]) {
      token = args[++i];
    }
  }

  return {
    orgId,
    cloudOrgId,
    clientId,
    forceAuth,
    transport,
    port,
    host,
    token,
  };
}

interface ServerConfig {
  defaultParentSlug?: string;
}

function createConfiguredServer(
  client: WikiClient,
  config: ServerConfig = {},
): McpServer {
  const server = new McpServer({
    name: "yandex-wiki-mcp",
    version: "0.1.0",
  });

  registerPageTools(server, client, {
    defaultParentSlug: config.defaultParentSlug,
  });
  registerResourceTools(server, client);
  registerGridTools(server, client);

  return server;
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body: unknown = JSON.parse(
          Buffer.concat(chunks).toString("utf-8"),
        );
        resolve(body);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJsonError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
  );
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  transport: StreamableHTTPServerTransport,
): Promise<void> {
  const parsedUrl = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  if (parsedUrl.pathname !== "/mcp") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const method = req.method?.toUpperCase();

  if (method === "POST") {
    let body: unknown;
    try {
      body = await parseJsonBody(req);
    } catch {
      sendJsonError(res, 400, -32700, "Parse error");
      return;
    }
    await transport.handleRequest(req, res, body);
  } else if (method === "GET") {
    await transport.handleRequest(req, res);
  } else if (method === "DELETE") {
    await transport.handleRequest(req, res);
  } else {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
  }
}

async function startHttpServer(
  client: WikiClient,
  port: number,
  host: string,
  config: ServerConfig,
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = createConfiguredServer(client, config);
  await server.connect(transport);

  const httpServer = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      handleMcpRequest(req, res, transport).catch((err: unknown) => {
        process.stderr.write(
          `Unhandled error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        if (!res.headersSent) {
          sendJsonError(res, 500, -32603, "Internal server error");
        }
      });
    },
  );

  httpServer.listen(port, host, () => {
    process.stderr.write(
      `MCP HTTP server listening on http://${host}:${port}/mcp\n`,
    );
  });
}

async function main(): Promise<void> {
  const {
    orgId: cliOrgId,
    cloudOrgId: cliCloudOrgId,
    clientId,
    forceAuth,
    transport,
    port,
    host,
    token: cliToken,
  } = parseArgs();

  const orgId = cliOrgId ?? process.env.YANDEX_ORG_ID;
  const cloudOrgId = cliCloudOrgId ?? process.env.YANDEX_CLOUD_ORG_ID;

  if (orgId && cloudOrgId) {
    process.stderr.write(
      "Error: Specify either --org-id / YANDEX_ORG_ID or --cloud-org-id / YANDEX_CLOUD_ORG_ID, not both.\n",
    );
    process.exit(1);
  }

  if (!orgId && !cloudOrgId) {
    process.stderr.write(
      "Error: You must specify either --org-id <value> / YANDEX_ORG_ID or --cloud-org-id <value> / YANDEX_CLOUD_ORG_ID.\n",
    );
    process.exit(1);
  }

  let token: string;
  if (cliToken) {
    token = cliToken;
  } else {
    token = await resolveToken({ clientId, forceAuth });
  }

  if (forceAuth) {
    process.stderr.write(
      `Token is stored in ~/.config/yandex-wiki-mcp/token.json. You can now start the server without --auth.\n`,
    );
    return;
  }

  const client = new WikiClient({ token, orgId, cloudOrgId });

  const defaultParentSlug =
    process.env.WIKI_DEFAULT_PARENT_SLUG?.trim() || undefined;
  const serverConfig: ServerConfig = { defaultParentSlug };

  if (transport === "http") {
    await startHttpServer(client, port, host, serverConfig);
  } else {
    const server = createConfiguredServer(client, serverConfig);
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Fatal error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
