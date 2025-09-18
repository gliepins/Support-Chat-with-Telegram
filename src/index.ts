import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4010;
const logger = pino({ transport: { target: 'pino-pretty' } });

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: false }));
app.use(helmet());
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => logger.info(`Support Chat API listening on ${PORT}`));
