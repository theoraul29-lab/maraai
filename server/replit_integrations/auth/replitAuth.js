import * as client from "openid-client";
import { Strategy } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import memoize from "memoizee";
import connectSqlite3 from "connect-sqlite3";
import { authStorage } from "./storage.js";

function isLocalAuthMode() {
  return process.env.AUTH_MODE === "local" || !process.env.REPL_ID;
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID,
    );
  },
  { maxAge: 3600 * 1000 },
);
export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const SqliteStore = connectSqlite3(session);
  return session({
    secret: process.env.SESSION_SECRET,
    store: new SqliteStore({
      db:
        process.env.DATABASE_URL?.replace(/^sqlite:\/\//, "") ||
        "maraai.sqlite",
      table: "sessions",
      ttl: sessionTtl / 1000,
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: sessionTtl,
    },
  });
}
function updateUserSession(user, tokens) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}
async function upsertUser(claims) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}
export async function setupAuth(app) {
  app.set("trust proxy", 1);
  app.use(getSession());

  if (isLocalAuthMode()) {
    await authStorage.upsertUser({
      id: "local-dev-user",
      email: "local@mara.ai",
      firstName: "Local",
      lastName: "Developer",
      profileImageUrl: null,
    });

    app.get("/api/login", (_req, res) => {
      res.redirect("/");
    });

    app.get("/api/callback", (_req, res) => {
      res.redirect("/");
    });

    app.get("/api/logout", (_req, res) => {
      res.status(204).end();
    });

    return;
  }

  app.use(passport.initialize());
  app.use(passport.session());
  const config = await getOidcConfig();
  const verify = async (tokens, verified) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };
  // Keep track of registered strategies
  const registeredStrategies = new Set();
  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain) => {
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
  passport.serializeUser((user, cb) => cb(null, user));
  passport.deserializeUser((user, cb) => cb(null, user));
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
          client_id: process.env.REPL_ID,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href,
      );
    });
  });
}
export const isAuthenticated = async (req, res, next) => {
  if (isLocalAuthMode()) {
    req.user = {
      claims: {
        sub: "local-dev-user",
        email: "local@mara.ai",
        first_name: "Local",
        last_name: "Developer",
      },
      expires_at: Number.MAX_SAFE_INTEGER,
    };
    return next();
  }

  const user = req.user;
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
