import React from "react";
import { useTranslation } from "react-i18next";

export default function PaymentButtons() {
  const { t } = useTranslation();

  const handlePayment = async (provider) => {
    // Call backend payment endpoint (stub)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/payments/${provider}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 10 }), // Example amount
        },
      );
      const data = await res.json();
      alert(data.message || "Payment processed");
    } catch (e) {
      alert("Payment failed");
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded shadow p-4 mt-6">
      <h2 className="text-lg font-bold mb-2">{t("payments")}</h2>
      <div className="flex gap-4">
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          onClick={() => handlePayment("stripe")}
        >
          Stripe
        </button>
        <button
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          onClick={() => handlePayment("paypal")}
        >
          PayPal
        </button>
      </div>
    </div>
  );
}
