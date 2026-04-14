import { maraCore } from "./mara-core";

(async function main() {
  try {
    await maraCore.start();
    console.log("App started");
  } catch (err) {
    console.error("App start error:", err);
    process.exit(1);
  }
})();
