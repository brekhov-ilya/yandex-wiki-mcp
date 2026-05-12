# yandex-wiki-mcp

MCP-сервер для [Yandex Wiki](https://wiki.yandex.ru/) API. Позволяет AI-ассистентам (Claude Code и совместимые клиенты) читать, создавать и редактировать страницы корпоративной вики — удобно для автоматического ведения документации к сервисам.

## Подключение

Порядок одинаковый для любого MCP-клиента:

1. Получить OAuth-токен (один раз, локально).
2. Прописать сервер в конфиге клиента.
3. Перезапустить клиент.

### Шаг 1. Получите OAuth-токен и ID организации

Определите тип организации:

- **Яндекс 360 для бизнеса** — нужен `org-id` (узнать: `https://admin.yandex.ru/` → «Об организации»)
- **Yandex Cloud Organization** — нужен `cloud-org-id` (узнать: `https://console.yandex.cloud/` → «Все организации»)

Запустите один раз локально — откроется браузер с авторизацией Яндекса:

```bash
npx -y yandex-wiki-mcp --org-id YOUR_ORG_ID --auth
# или
npx -y yandex-wiki-mcp --cloud-org-id YOUR_CLOUD_ORG_ID --auth
```

CLI использует PKCE (RFC 7636) — без `client_secret`. Если хотите использовать собственное OAuth-приложение, зарегистрируйте его на [oauth.yandex.ru](https://oauth.yandex.ru/) с Redirect URI `http://localhost:27312/callback` и правами `wiki:read`, `wiki:write`, после чего передайте `--client-id YOUR_APP_ID`.

Токен сохраняется в `~/.config/yandex-wiki-mcp/token.json` (права `0600`) и оттуда же читается при последующих запусках. При истечении срока сервер сам обновит токен через `refresh_token`.

### Шаг 2. Пропишите сервер в конфиге клиента

Базовый пример для **Яндекс 360 для бизнеса**:

```json
{
  "mcpServers": {
    "yandex-wiki": {
      "command": "npx",
      "args": ["-y", "yandex-wiki-mcp"],
      "env": {
        "YANDEX_ORG_ID": "1234567"
      }
    }
  }
}
```

Для **Yandex Cloud Organization** замените `YANDEX_ORG_ID` на `YANDEX_CLOUD_ORG_ID`.

#### Claude Code

Файл `.mcp.json` в корне проекта (project-scoped). Положите в него JSON-пример выше.

Альтернатива через CLI (user-scoped):

```bash
claude mcp add yandex-wiki --transport stdio \
  --env YANDEX_ORG_ID=1234567 \
  -- npx -y yandex-wiki-mcp
```

#### Claude Desktop

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Cursor

- **Проект**: `.cursor/mcp.json`
- **Глобально**: `~/.cursor/mcp.json`

#### Codex CLI / IDE extension

```toml
[mcp_servers.yandex-wiki]
command = "npx"
args = ["-y", "yandex-wiki-mcp"]

[mcp_servers.yandex-wiki.env]
YANDEX_ORG_ID = "1234567"
```

### Совместная работа с `yandex-tracker-mcp`

Если у вас одновременно установлены `yandex-tracker-mcp` и `yandex-wiki-mcp` и OAuth-приложение настроено с правами и `tracker:*`, и `wiki:*`, можно задать общий токен через `YANDEX_OAUTH_TOKEN` — он будет использован обоими серверами. Конфигурационные каталоги (`~/.config/yandex-tracker-mcp/` и `~/.config/yandex-wiki-mcp/`) не конфликтуют.

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `YANDEX_ORG_ID` | ID организации Яндекс 360 для бизнеса (заголовок `X-Org-ID`) |
| `YANDEX_CLOUD_ORG_ID` | ID Yandex Cloud Organization (заголовок `X-Cloud-Org-ID`) |
| `YANDEX_OAUTH_TOKEN` | Опционально. Переопределяет токен из `~/.config/yandex-wiki-mcp/token.json` |
| `WIKI_DEFAULT_PARENT_SLUG` | Опционально. Slug родительской страницы по умолчанию для `create_page` |

Указывайте ровно один из `YANDEX_ORG_ID` / `YANDEX_CLOUD_ORG_ID`.

## Доступные инструменты

| Инструмент | Описание |
|---|---|
| `get_page` | Получить страницу по slug |
| `get_page_by_id` | Получить страницу по числовому ID |
| `get_descendants` | Список дочерних страниц по slug родителя (пагинация) |
| `create_page` | Создать новую страницу (Markdown content + parent) |
| `update_page` | Обновить заголовок и/или содержимое страницы |
| `move_page` | Переместить страницу или переименовать её slug |
| `get_page_resources` | Получить вложения и ресурсы страницы |
| `get_page_grids` | Список динамических таблиц на странице |
| `get_grid` | Получить таблицу с колонками и строками |

## Лицензия

MIT
