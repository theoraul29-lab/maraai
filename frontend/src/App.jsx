import React from "react";
import ChatUI from "./components/ChatUI";
import Feed from "./components/Feed";
import Academy from "./components/Academy";
import PaymentButtons from "./components/PaymentButtons";
import LanguageSwitcher from "./components/LanguageSwitcher";
import VoiceAI from "./components/VoiceAI";
import AdminPanel from "./components/AdminPanel";
import { useUserMemory } from "./hooks/useUserMemory";

export default function App() {
  useUserMemory("visit", { page: "main" });
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <h1 className="text-2xl font-bold mb-4">MaraAI Platform</h1>
      <LanguageSwitcher />
      <ChatUI />
      <Feed />
      <Academy />
      <PaymentButtons />
      <VoiceAI />
      <AdminPanel />
    </div>
  );
}
