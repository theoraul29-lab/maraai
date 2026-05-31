-- Prevent duplicate unconsumed OTP codes for the same (email, purpose) pair.
-- Without this index, two rapid requests for the same email+purpose could each
-- insert a new code, and both would pass the "consumed_at IS NULL" check during
-- verification — allowing the second code to be accepted after the first is used.
--
-- The partial index only covers unconsumed rows (consumed_at IS NULL), so
-- consumed rows are not constrained and old history is preserved for auditing.
CREATE UNIQUE INDEX IF NOT EXISTS `idx_email_otp_unconsumed`
  ON `email_otp_codes` (`email`, `purpose`)
  WHERE `consumed_at` IS NULL;
