import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectSqlite3 from "connect-sqlite3";
import { authStorage } from "./storage.js";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

// Dynamic imports for openid-client (v6+ has /passport subpath, v5 does not)
let client: typeof import("openid-client") | null = null;
let Strategy: any = null;
type VerifyFunction = (...args: any[]) => void;

async function loadOidcModules() {
  if (client) return;
  client = await import("openid-client");
  try {
    const passportMod = await import("openid-client/passport" as any);
    Strategy = passportMod.Strategy;
  } catch {
    // openid-client v5 — Strategy not available as subpath export
    console.warn("openid-client/passport not available — OAuth login disabled. Use AUTH_MODE=local.");
  }
}

declare module "express-session" {
  interface SessionData {
    localUserId?: string;
  }
}

function isLocalAuthMode() {
  return (process.env.AUTH_MODE || "oauth").toLowerCase() === "local";
}

const getOidcConfig = memoize(
  async () => {
    await loadOidcModules();
    return await client!.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!,
    );
  },
  { maxAge: 3600 * 1000 },
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const SqliteStore = connectSqlite3(session);
  const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");

  if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }

  return session({
    secret: sessionSecret,
    store: new SqliteStore({
      db:
        process.env.DATABASE_URL?.replace(/^sqlite:\/\//, "") ||
        "maraai.sqlite",
      table: "sessions",
      ttl: sessionTtl / 1000, // in seconds
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: any,
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  const hydrateLocalSessionUser: RequestHandler = async (req, _res, next) => {
    if (!isLocalAuthMode()) return next();
    const userId = req.session?.localUserId;
    if (!userId) return next();

    try {
      const user = await authStorage.getUser(userId);
      if (!user) {
        req.session.localUserId = undefined;
        return next();
      }

      (req as any).user = {
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
        },
        expires_at: Number.MAX_SAFE_INTEGER,
      };

      return next();
    } catch {
      return next();
    }
  };

  app.use(hydrateLocalSessionUser);

  if (isLocalAuthMode()) {
    const localAuthPayloadSchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      firstName: z.string().trim().min(1).max(80).optional(),
      lastName: z.string().trim().max(80).optional(),
    });

    app.get("/api/auth/mode", (_req, res) => {
      res.json({ mode: "local" });
    });

    app.post("/api/auth/register", async (req, res) => {
      const parsed = localAuthPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      try {
        const passwordHash = await bcrypt.hash(parsed.data.password, 10);
        const user = await authStorage.createLocalUserAccount({
          email: parsed.data.email,
          passwordHash,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
        });

        req.session.localUserId = user.id;
        req.session.save(() => {
          res.status(201).json(user);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to register";
        if (message.includes("exists")) {
          return res.status(409).json({ message: "Email already exists" });
        }
        return res.status(500).json({ message: "Failed to register" });
      }
    });

    app.post("/api/auth/login", async (req, res) => {
      const parsed = localAuthPayloadSchema
        .omit({ firstName: true, lastName: true })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      try {
        const user = await authStorage.verifyLocalUserCredentials({
          email: parsed.data.email,
          password: parsed.data.password,
          comparePassword: bcrypt.compare,
        });

        if (!user) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        req.session.localUserId = user.id;
        req.session.save(() => {
          res.status(200).json(user);
        });
      } catch {
        return res.status(500).json({ message: "Failed to login" });
      }
    });

    async function signInLocalGuest(req: any, res: any) {
      if ((process.env.ALLOW_LOCAL_GUEST_LOGIN || "false").toLowerCase() !== "true") {
        return res.status(403).json({ message: "Guest login disabled" });
      }

      let guestUser = await authStorage.getUserByEmail("local@mara.ai");

      if (!guestUser) {
        const guestPasswordHash = await bcrypt.hash("local-guest-password", 10);
        guestUser = await authStorage.createLocalUserAccount({
          email: "local@mara.ai",
          passwordHash: guestPasswordHash,
          firstName: "Local",
          lastName: "Guest",
        });
      }

      req.session.localUserId = guestUser.id;
      req.session.save(() => {
        res.redirect("/");
      });
    }

    app.get("/api/login", async (req, res) => {
      await signInLocalGuest(req, res);
    });

    app.get("/api/callback", async (req, res) => {
      await signInLocalGuest(req, res);
    });

    app.get("/api/logout", (req, res) => {
      req.session.localUserId = undefined;
      req.session.save(() => {
        res.status(204).end();
      });
    });

    app.post("/api/auth/logout", (req, res) => {
      req.session.localUserId = undefined;
      req.session.save(() => {
        res.status(204).end();
      });
    });

    return;
  }

  // OAuth mode requires openid-client v6+ with /passport subpath
  await loadOidcModules();
  if (!Strategy || !client) {
    console.warn("OAuth strategy not available. Falling back to no-auth mode. Set AUTH_MODE=local or install openid-client v6+.");
    app.get("/api/auth/mode", (_req, res) => {
      res.json({ mode: "none" });
    });
    return;
  }

  app.get("/api/auth/mode", (_req, res) => {
    res.json({ mode: "oauth" });
  });

  app.use(passport.initialize());
  app.use(passport.session());

  let config: any;
  try {
    config = await getOidcConfig();
  } catch (err) {
    console.warn("OIDC discovery failed — OAuth disabled:", (err as Error).message);
    return;
  }

  const verify = async (
    tokens: any,
    verified: passport.AuthenticateCallback,
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href,
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (isLocalAuthMode()) {
    const userId = req.session?.localUserId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await authStorage.getUser(userId);
    if (!user) {
      req.session.localUserId = undefined;
      return res.status(401).json({ message: "Unauthorized" });
    }

    (req as any).user = {
      claims: {
        sub: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
      },
      expires_at: Number.MAX_SAFE_INTEGER,
    };

    return next();
  }

  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
