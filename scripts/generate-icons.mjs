import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const sourcePng = path.join(repoRoot, "assets", "footer-logo-darksol.png");
const iconsDir = path.join(repoRoot, "assets", "icons");

const favicon32Path = path.join(iconsDir, "favicon-32x32.png");
const appleTouchIconPath = path.join(iconsDir, "apple-touch-icon.png");
const faviconIcoPath = path.join(iconsDir, "favicon.ico");
const manifestPath = path.join(iconsDir, "site.webmanifest");

async function main() {
  await mkdir(iconsDir, { recursive: true });

  await sharp(sourcePng).resize(32, 32, { fit: "cover" }).png().toFile(favicon32Path);
  await sharp(sourcePng).resize(180, 180, { fit: "cover" }).png().toFile(appleTouchIconPath);

  // Placeholder ICO if proper multi-size ICO generation is not available.
  await cp(favicon32Path, faviconIcoPath, { force: true });

  const manifest = {
    name: "DARKSOL Inference",
    short_name: "DARKSOL",
    icons: [
      {
        src: "/assets/icons/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png"
      },
      {
        src: "/assets/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png"
      },
      {
        src: "/assets/icons/favicon.ico",
        sizes: "32x32",
        type: "image/x-icon",
        purpose: "any"
      }
    ],
    theme_color: "#060b1a",
    background_color: "#060b1a",
    display: "standalone"
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log("Generated icons in assets/icons:");
  console.log("- favicon-32x32.png");
  console.log("- apple-touch-icon.png");
  console.log("- favicon.ico (placeholder copy of favicon-32x32.png)");
  console.log("- site.webmanifest");
}

main().catch((error) => {
  console.error("Failed to generate icons:", error);
  process.exitCode = 1;
});
