import axios from "axios";

export async function askOpenRouterMeaningOfLife(apiKey: string) {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-5.2",
      messages: [
        {
          role: "user",
          content: "What is the meaning of life?",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );
  return response.data;
}

// Exemplu de utilizare:
// (async () => {
//   const result = await askOpenRouterMeaningOfLife(process.env.OPENROUTER_API_KEY!);
//   console.log(result.choices[0].message.content);
// })();
