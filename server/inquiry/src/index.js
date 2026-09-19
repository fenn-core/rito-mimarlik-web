import process from "node:process";
import { loadConfig } from "./config.js";
import { createInquiryServer } from "./service.js";
import { createZohoMailer } from "./zoho-mail.js";

try {
  const config = loadConfig();
  const mailer = createZohoMailer({ ...config.zoho, toAddress: config.inquiryTo });
  const server = createInquiryServer({ config, mailer });
  server.listen(config.port, config.host, () => {
    console.info({ timestamp: new Date().toISOString(), category: "service_started" });
  });
} catch (error) {
  console.error({ timestamp: new Date().toISOString(), category: "configuration_error", code: error.message });
  process.exitCode = 1;
}
