"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Centralized env loader: prefer system env file if present, else fallback to project .env
(() => {
    try {
        const systemEnv = '/etc/autoroad/support-chat.env';
        if (fs_1.default.existsSync(systemEnv)) {
            dotenv_1.default.config({ path: systemEnv });
            return;
        }
    }
    catch { }
    try {
        dotenv_1.default.config({ path: path_1.default.join(__dirname, '..', '..', '.env') });
    }
    catch { }
})();
//# sourceMappingURL=env.js.map