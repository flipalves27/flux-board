export const PUBLIC_API_V1_OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Flux-Board Public API",
    version: "1.0.0",
    description: "Public API v1 for external integrations.",
  },
  servers: [{ url: "/api/public/v1" }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
      },
    },
    schemas: {
      BoardSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          orgId: { type: "string" },
          ownerId: { type: "string" },
          boardMethodology: { type: "string", enum: ["scrum", "kanban", "lean_six_sigma"] },
          clientLabel: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time", nullable: true },
          lastUpdated: { type: "string", format: "date-time", nullable: true },
        },
        required: ["id", "name", "orgId", "ownerId"],
      },
      CardSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          boardId: { type: "string" },
          boardName: { type: "string" },
          bucket: { type: "string", nullable: true },
          priority: { type: "string", nullable: true },
          progress: { type: "string", nullable: true },
          dueDate: { type: "string", nullable: true },
          updatedAt: { type: "string", nullable: true },
        },
        required: ["id", "title", "boardId", "boardName"],
      },
      SprintSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          boardId: { type: "string" },
          name: { type: "string" },
          goal: { type: "string" },
          status: { type: "string" },
          startDate: { type: "string", nullable: true },
          endDate: { type: "string", nullable: true },
          velocity: { type: "number", nullable: true },
          updatedAt: { type: "string", nullable: true },
        },
        required: ["id", "boardId", "name", "status"],
      },
      CommentSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          boardId: { type: "string" },
          cardId: { type: "string" },
          authorId: { type: "string" },
          body: { type: "string" },
          mentions: { type: "array", items: { type: "string" } },
          createdAt: { type: "string", nullable: true },
          editedAt: { type: "string", nullable: true },
        },
        required: ["id", "boardId", "cardId", "authorId", "body", "mentions"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
          code: { type: "string" },
        },
        required: ["error", "code"],
      },
    },
  },
  paths: {
    "/openapi": {
      get: {
        summary: "Get OpenAPI document",
        responses: {
          200: {
            description: "OpenAPI 3.1 JSON",
          },
        },
      },
    },
    "/boards": {
      get: {
        summary: "List boards for configured organization",
        description: "Required scope: boards:read",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "q", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Board list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/BoardSummary" } },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                  },
                  required: ["items", "page", "limit", "total"],
                },
              },
            },
          },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          503: { description: "Not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/cards": {
      get: {
        summary: "List cards",
        description: "Required scope: cards:read",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "boardId", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "bucket", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Card list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/CardSummary" } },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                  },
                  required: ["items", "page", "limit", "total"],
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create card",
        description: "Required scope: cards:write",
        responses: {
          201: { description: "Card created" },
        },
      },
      patch: {
        summary: "Update card",
        description: "Required scope: cards:write",
        responses: {
          200: { description: "Card updated" },
        },
      },
    },
    "/sprints": {
      get: {
        summary: "List sprints",
        description: "Required scope: sprints:read",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "boardId", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["planning", "active", "review", "closed"] } },
        ],
        responses: {
          200: {
            description: "Sprint list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/SprintSummary" } },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                  },
                  required: ["items", "page", "limit", "total"],
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create sprint",
        description: "Required scope: sprints:write",
        responses: {
          201: { description: "Sprint created" },
        },
      },
      patch: {
        summary: "Update sprint",
        description: "Required scope: sprints:write",
        responses: {
          200: { description: "Sprint updated" },
        },
      },
    },
    "/comments": {
      get: {
        summary: "List comments for card",
        description: "Required scope: comments:read",
        parameters: [
          { name: "boardId", in: "query", required: true, schema: { type: "string" } },
          { name: "cardId", in: "query", required: true, schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "Comment list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/CommentSummary" } },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                  },
                  required: ["items", "page", "limit", "total"],
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create comment",
        description: "Required scope: comments:write",
        responses: {
          201: { description: "Comment created" },
        },
      },
    },
  },
} as const;

