import "dotenv/config";

// Integration tests read emails from the in-memory outbox instead of SMTP.
delete process.env.SMTP_HOST;
