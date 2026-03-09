const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");

// In-memory email campaign store for demo (replace with DB in production)
const campaigns = [];

// Configure nodemailer (example: Gmail SMTP, replace with real credentials in production)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// POST /api/marketing/campaign - Create and send an email campaign
router.post("/campaign", async (req, res) => {
  const { subject, content, recipients } = req.body;
  if (
    !subject ||
    !content ||
    !Array.isArray(recipients) ||
    recipients.length === 0
  ) {
    return res
      .status(400)
      .json({ error: "subject, content, and recipients required" });
  }
  const campaign = { subject, content, recipients, createdAt: new Date() };
  campaigns.push(campaign);
  // Send emails
  try {
    for (const to of recipients) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        text: content,
      });
    }
    res.json({ success: true, campaign });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to send emails", details: err.message });
  }
});

// GET /api/marketing/campaigns - List all campaigns
router.get("/campaigns", (req, res) => {
  res.json({ campaigns });
});

module.exports = router;
