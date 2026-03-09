import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function AdminPanel() {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `${import.meta.env.VITE_API_URL}/api/admin/stats?lang=${i18n.language}`,
    )
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [i18n.language]);

  return (
    <div className="max-w-md mx-auto bg-white rounded shadow p-4 mt-6">
      <h2 className="text-lg font-bold mb-2">{t("admin_panel")}</h2>
      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : stats ? (
        <div className="space-y-2">
          <div>
            <b>{t("users")}</b>: {stats.users}
          </div>
          <div>
            <b>{t("messages")}</b>: {stats.messages}
          </div>
          <div>
            <b>{t("payments")}</b>: {stats.payments}
          </div>
          <div>
            <b>{t("reels")}</b>: {stats.reels}
          </div>
        </div>
      ) : (
        <div className="text-gray-500">No stats available.</div>
      )}
    </div>
  );
}
