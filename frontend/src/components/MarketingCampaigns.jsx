import React, { useState } from "react";

export default function MarketingCampaigns() {
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [recipients, setRecipients] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const fetchCampaigns = async () => {
    const res = await fetch(
      `${import.meta.env.VITE_API_URL}/api/marketing/campaigns`,
    );
    const data = await res.json();
    setCampaigns(data.campaigns || []);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/marketing/campaign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            content,
            recipients: recipients
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean),
          }),
        },
      );
      const data = await res.json();
      if (data.success) {
        setMessage("Campaign sent!");
        setSubject("");
        setContent("");
        setRecipients("");
        fetchCampaigns();
      } else {
        setMessage(data.error || "Failed to send campaign");
      }
    } catch {
      setMessage("Failed to send campaign");
    }
    setLoading(false);
  };

  React.useEffect(() => {
    fetchCampaigns();
  }, []);

  return (
    <div className="max-w-xl mx-auto bg-white rounded shadow p-4 mt-6">
      <h2 className="text-lg font-bold mb-2">Marketing Campaigns</h2>
      <form onSubmit={handleSend} className="space-y-2 mb-4">
        <input
          className="w-full border rounded p-2"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
        <textarea
          className="w-full border rounded p-2"
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
        <input
          className="w-full border rounded p-2"
          placeholder="Recipients (comma separated emails)"
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          required
        />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          type="submit"
          disabled={loading}
        >
          {loading ? "Sending..." : "Send Campaign"}
        </button>
      </form>
      {message && <div className="mb-2 text-sm text-blue-700">{message}</div>}
      <h3 className="font-semibold mt-4 mb-2">Sent Campaigns</h3>
      <ul className="space-y-2">
        {campaigns.map((c, i) => (
          <li key={i} className="border rounded p-2 bg-gray-50">
            <div>
              <b>Subject:</b> {c.subject}
            </div>
            <div>
              <b>Recipients:</b> {c.recipients.join(", ")}
            </div>
            <div>
              <b>Sent:</b> {new Date(c.createdAt).toLocaleString()}
            </div>
            <div>
              <b>Content:</b> {c.content}
            </div>
          </li>
        ))}
        {campaigns.length === 0 && (
          <li className="text-gray-500">No campaigns sent yet.</li>
        )}
      </ul>
    </div>
  );
}
