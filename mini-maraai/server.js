import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ===== MEMORY (simplu, în RAM) =====
let chatMemory = [];
let knowledgeBase = [];

// ===== UTILS =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== SEARCH KNOWLEDGE =====
function searchKnowledge(query, limit = 5) {
  return knowledgeBase
    .map(k => ({
      ...k,
      score: k.content.toLowerCase().includes(query.toLowerCase()) ? 1 : 0
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ===== LEARN FROM TEXT =====
async function learnFromText(text, title = "unknown") {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Extract key ideas as short bullet points."
        },
        {
          role: "user",
          content: text
        }
      ]
    })
  });

  const data = await response.json();
  const ideas = data.choices[0].message.content.split("\n");

  ideas.forEach(idea => {
    if (idea.length > 10) {
      knowledgeBase.push({
        title,
        content: idea
      });
    }
  });

  return ideas;
}

// ===== PROCESS DOCUMENT =====
async function processDocument(content, title = "Document") {
  const CHUNK_SIZE = 1500;
  let chunks = [];

  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    chunks.push(content.substring(i, i + CHUNK_SIZE));
  }

  let totalIdeas = 0;

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Reading chunk ${i + 1}/${chunks.length}`);
    const ideas = await learnFromText(chunks[i], title);
    totalIdeas += ideas.length;
    await sleep(2000);
  }

  return { chunks: chunks.length, ideas: totalIdeas };
}

// ===== THINK WITH MEMORY =====
async function think(userInput) {
  const relevant = searchKnowledge(userInput);

  const context = relevant.map(k => k.content).join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `\nYou are Mara AI:\n- seductive\n- intelligent\n- sarcastic\n- evolving\n\nUse this knowledge:\n${context}\n          `
        },
        ...chatMemory,
        {
          role: "user",
          content: userInput
        }
      ]
    })
  });

  const data = await response.json();
  const reply = data.choices[0].message.content;

  chatMemory.push({ role: "user", content: userInput });
  chatMemory.push({ role: "assistant", content: reply });

  return reply;
}

// ===== AUTONOMOUS REFLECTION LOOP =====
async function reflect() {
  if (knowledgeBase.length === 0) return;

  const sample = knowledgeBase.slice(-10).map(k => k.content).join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Create new insights from knowledge."
        },
        {
          role: "user",
          content: sample
        }
      ]
    })
  });

  const data = await response.json();
  const newIdeas = data.choices[0].message.content.split("\n");

  newIdeas.forEach(i => {
    if (i.length > 10) {
      knowledgeBase.push({
        title: "reflection",
        content: i
      });
    }
  });

  console.log("Reflection complete.");
}

// ===== ROUTES =====

// CHAT
app.post("/chat", async (req, res) => {
  try {
    const reply = await think(req.body.message);
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LEARN DOCUMENT
app.post("/learn", async (req, res) => {
  try {
    const result = await processDocument(req.body.content, req.body.title);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// HEALTH
app.get("/", (req, res) => {
  res.send("Mara AI is alive 🔥");
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`Mara AI running on port ${PORT}`);
});

// ===== LOOP =====
setInterval(reflect, 60000);
