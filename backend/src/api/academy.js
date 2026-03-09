const express = require("express");
const router = express.Router();

// Example lessons in multiple languages
const lessonsData = {
  en: [
    {
      title: "Intro to Trading",
      content: "Learn the basics of trading and investing.",
    },
    {
      title: "Risk Management",
      content: "How to manage risk in your portfolio.",
    },
  ],
  ro: [
    {
      title: "Introducere în tranzacționare",
      content:
        "Învață elementele de bază ale tranzacționării și investițiilor.",
    },
    {
      title: "Managementul riscului",
      content: "Cum să gestionezi riscul în portofoliul tău.",
    },
  ],
  de: [
    {
      title: "Einführung in den Handel",
      content: "Lerne die Grundlagen des Handels und der Investition.",
    },
    {
      title: "Risikomanagement",
      content: "Wie man das Risiko im Portfolio managt.",
    },
  ],
  ru: [
    {
      title: "Введение в трейдинг",
      content: "Изучите основы трейдинга и инвестирования.",
    },
    {
      title: "Управление рисками",
      content: "Как управлять рисками в портфеле.",
    },
  ],
  uk: [
    {
      title: "Вступ до трейдингу",
      content: "Вивчайте основи трейдингу та інвестування.",
    },
    {
      title: "Управління ризиками",
      content: "Як керувати ризиками у портфелі.",
    },
  ],
};

router.get("/", (req, res) => {
  const lang = req.query.lang || "en";
  const lessons = lessonsData[lang] || lessonsData["en"];
  res.json({ lessons });
});

module.exports = router;
