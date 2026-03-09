import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function Feed() {
  const { t, i18n } = useTranslation();
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/reels?lang=${i18n.language}`)
      .then((res) => res.json())
      .then((data) => {
        setReels(data.reels || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [i18n.language]);

  return (
    <div className="mb-6 max-w-xl mx-auto bg-white rounded shadow p-4">
      <h2 className="text-lg font-bold mb-2">{t("feed")}</h2>
      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-4">
          {reels.length === 0 && (
            <div className="text-gray-500">No reels found.</div>
          )}
          {reels.map((reel, i) => (
            <div key={i} className="border rounded p-2 bg-gray-50">
              <div className="font-semibold mb-1">
                {reel.title || `Reel #${i + 1}`}
              </div>
              <div>{reel.caption || "(No caption)"}</div>
              {reel.videoUrl && (
                <video
                  src={reel.videoUrl}
                  controls
                  className="w-full mt-2 rounded"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
