import process from "node:process";
import nodemailer from "nodemailer";
import { loadConfig } from "./config.js";
import { createInquiryServer } from "./service.js";

try {
  const config = loadConfig();
  const mailer = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.password },
    tls: { rejectUnauthorized: true },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const server = createInquiryServer({ config, mailer });
  server.listen(config.port, config.host, () => {
    console.info({ timestamp: new Date().toISOString(), category: "service_started" });
  });
} catch (error) {
  console.error({ timestamp: new Date().toISOString(), category: "configuration_error", code: error.message });
  process.exitCode = 1;
}
