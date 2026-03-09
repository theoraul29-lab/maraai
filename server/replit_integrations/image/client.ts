const fs = require("fs");
const { Buffer } = require("buffer");
const { OpenAIApi, Configuration } = require("openai");

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    basePath: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  }),
);

/**
 * Generate an image and return as Buffer.
 * Uses gpt-image-1 model via Replit AI Integrations.
 */

async function generateImageBuffer(prompt: string, size: string = "1024x1024") {
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
  });
  const base64 = response.data[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

/**
 * Edit/combine multiple images into a composite.
 * Uses gpt-image-1 model via Replit AI Integrations.
 */

async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string,
) {
  const images = await Promise.all(
    imageFiles.map((file: string) => ({
      createReadStream: () => fs.createReadStream(file),
      fileName: file,
      type: "image/png",
    })),
  );

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}

module.exports = {
  openai,
  generateImageBuffer,
  editImages,
};
