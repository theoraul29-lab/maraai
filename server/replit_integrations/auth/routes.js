import { authStorage } from "./storage.js";
import { isAuthenticated } from "./replitAuth";
// Register auth-specific routes
export function registerAuthRoutes(app) {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
