import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { initDB, persistDB } from './db.js';
import authRouter from './routes/auth.js';
import workersRouter from './routes/workers.js';
import usersRouter from './routes/users.js';
import bordereauRouter from './routes/bordereau.js';
import settingsRouter from './routes/settings.js';

const app = express();
const PORT = parseInt(process.env.SERVER_PORT ?? '3001', 10);
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null,
      } as any,
    },
    crossOriginEmbedderPolicy: false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  })
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.use(
  cors({
    origin: isProd ? false : ['http://localhost:5000', `http://localhost:${PORT}`],
    credentials: true,
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/workers', workersRouter);
app.use('/api/users', usersRouter);
app.use('/api/bordereau', bordereauRouter);
app.use('/api/settings', settingsRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint introuvable' });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]', err.message);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

await initDB();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔒 CSGM API server → http://0.0.0.0:${PORT}`);
});

const shutdown = () => {
  console.log('\n⏹  Shutting down...');
  persistDB();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
