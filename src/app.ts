import 'dotenv/config';
import express from 'express';
import authRouter from './modules/auth';
import { errorHandler } from './middleware/error-handler';

export const app = express();

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'gaegulzip-server API', version: '1.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

app.use('/auth', authRouter);

// Error handling (must be last)
app.use(errorHandler);
