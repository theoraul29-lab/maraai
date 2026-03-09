import { z } from "zod";
import { insertVideoSchema, videos, chatMessages } from "./schema.js";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  videos: {
    list: {
      method: "GET" as const,
      path: "/api/videos" as const,
      input: z.object({ topic: z.string().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof videos.$inferSelect>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/videos" as const,
      input: insertVideoSchema,
      responses: {
        201: z.custom<typeof videos.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    like: {
      method: "POST" as const,
      path: "/api/videos/:id/like" as const,
      responses: {
        200: z.object({ liked: z.boolean(), likes: z.number() }),
      },
    },
    view: {
      method: "POST" as const,
      path: "/api/videos/:id/view" as const,
      responses: {
        200: z.object({ views: z.number() }),
      },
    },
  },
  chat: {
    list: {
      method: "GET" as const,
      path: "/api/chat" as const,
      responses: {
        200: z.array(z.custom<typeof chatMessages.$inferSelect>()),
      },
    },
    send: {
      method: "POST" as const,
      path: "/api/chat" as const,
      input: z.object({
        message: z.string(),
        module: z.enum(["trading", "writers", "reels"]).optional(),
      }),
      responses: {
        200: z.object({
          message: z.custom<typeof chatMessages.$inferSelect>(),
          aiResponse: z.custom<typeof chatMessages.$inferSelect>(),
        }),
        400: errorSchemas.validation,
      },
    },
  },
  profile: {
    get: {
      method: "GET" as const,
      path: "/api/profile/:id" as const,
      responses: {
        200: z.object({
          user: z.any(),
          videoCount: z.number(),
          followerCount: z.number(),
          followingCount: z.number(),
          isFollowing: z.boolean().optional(),
        }),
        404: errorSchemas.notFound,
      },
    },
    follow: {
      method: "POST" as const,
      path: "/api/profile/:id/follow" as const,
      responses: {
        200: z.object({ following: z.boolean() }),
      },
    },
  },
};

export function buildUrl(
  path: string,
  params?: Record<string, string | number>,
): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type VideoInput = z.infer<typeof api.videos.create.input>;
export type VideoResponse = z.infer<(typeof api.videos.create.responses)[201]>;
export type ChatInput = z.infer<typeof api.chat.send.input>;
export type ChatResponse = z.infer<(typeof api.chat.send.responses)[200]>;
export type ProfileResponse = z.infer<(typeof api.profile.get.responses)[200]>;
