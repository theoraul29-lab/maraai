import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Pentru __dirname în ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Servește fișierele statice din folderul frontend/dist/public
app.use(express.static(path.join(__dirname, "frontend/dist/public")));
app.use(
  "/assets",
  express.static(path.join(__dirname, "frontend/dist/assets")),
);

// Fallback: orice alt request returnează index.html (pentru SPA)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend/dist/public/index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MaraAI server running at http://localhost:${PORT}`);
  console.log(`Make sure your frontend is built in frontend/dist/public`);
});
