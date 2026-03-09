import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function Academy() {
  const { t, i18n } = useTranslation();
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/academy?lang=${i18n.language}`)
      .then((res) => res.json())
      .then((data) => {
        setLessons(data.lessons || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [i18n.language]);

  return (
    <div className="mb-6 max-w-xl mx-auto bg-white rounded shadow p-4">
      <h2 className="text-lg font-bold mb-2">{t("academy")}</h2>
      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-4">
          {lessons.length === 0 && (
            <div className="text-gray-500">No lessons found.</div>
          )}
          {lessons.map((lesson, i) => (
            <div key={i} className="border rounded p-2 bg-gray-50">
              <div className="font-semibold mb-1">
                {lesson.title || `Lesson #${i + 1}`}
              </div>
              <div>{lesson.content || "(No content)"}</div>
              {lesson.chartUrl && (
                <img
                  src={lesson.chartUrl}
                  alt="Chart"
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
