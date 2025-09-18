"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrisma = getPrisma;
const client_1 = require("@prisma/client");
let prismaClientSingleton = null;
function getPrisma() {
    if (prismaClientSingleton) {
        return prismaClientSingleton;
    }
    prismaClientSingleton = new client_1.PrismaClient({
        log: ['warn', 'error'],
    });
    return prismaClientSingleton;
}
//# sourceMappingURL=client.js.map