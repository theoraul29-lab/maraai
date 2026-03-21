import { z } from 'zod';
import { insertVideoSchema } from './schema.js';
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
      method: 'GET',
      path: '/api/videos',
      input: z.object({ topic: z.string().optional() }).optional(),
      responses: {
        200: z.array(z.custom()),
      },
    },
    create: {
      method: 'POST',
      path: '/api/videos',
      input: insertVideoSchema,
      responses: {
        201: z.custom(),
        400: errorSchemas.validation,
      },
    },
    like: {
      method: 'POST',
      path: '/api/videos/:id/like',
      responses: {
        200: z.object({ liked: z.boolean(), likes: z.number() }),
      },
    },
    view: {
      method: 'POST',
      path: '/api/videos/:id/view',
      responses: {
        200: z.object({ views: z.number() }),
      },
    },
  },
  chat: {
    list: {
      method: 'GET',
      path: '/api/chat',
      responses: {
        200: z.array(z.custom()),
      },
    },
    send: {
      method: 'POST',
      path: '/api/chat',
      input: z.object({
        message: z.string(),
        module: z.enum(['trading', 'writers', 'reels']).optional(),
      }),
      responses: {
        200: z.object({
          message: z.custom(),
          aiResponse: z.custom(),
        }),
        400: errorSchemas.validation,
      },
    },
  },
  profile: {
    get: {
      method: 'GET',
      path: '/api/profile/:id',
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
      method: 'POST',
      path: '/api/profile/:id/follow',
      responses: {
        200: z.object({ following: z.boolean() }),
      },
    },
  },
};
export function buildUrl(path, params) {
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
