import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Centralized env loader: prefer system env file if present, else fallback to project .env
(() => {
  try {
    const systemEnv = '/etc/autoroad/support-chat.env';
    if (fs.existsSync(systemEnv)) {
      dotenv.config({ path: systemEnv });
      return;
    }
  } catch {}
  try {
    dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
  } catch {}
})();


