import React, { useState } from "react";
import { useTranslation } from "react-i18next";

export default function ChatUI() {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg = { sender: "user", text: input };
    setMessages((msgs) => [...msgs, userMsg]);
    setLoading(true);
    setInput("");
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          lang: i18n.language,
          userId: "demo",
        }),
      });
      const data = await res.json();
      setMessages((msgs) => [...msgs, { sender: "ai", text: data.response }]);
    } catch (err) {
      setMessages((msgs) => [
        ...msgs,
        { sender: "ai", text: "[Error contacting AI]" },
      ]);
    }
    setLoading(false);
  };

  return (
    <div className="mb-6 max-w-xl mx-auto bg-white rounded shadow p-4">
      <h2 className="text-lg font-bold mb-2">{t("chat")}</h2>
      <div className="h-48 overflow-y-auto border rounded p-2 mb-2 bg-gray-50">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.sender === "user" ? "text-right" : "text-left text-blue-600"
            }
          >
            <span className="inline-block px-2 py-1 rounded bg-gray-200 m-1">
              {msg.text}
            </span>
          </div>
        ))}
        {loading && <div className="text-gray-400">...</div>}
      </div>
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          className="flex-1 border rounded p-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chat") + "..."}
        />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded"
          type="submit"
          disabled={loading}
        >
          {loading ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
