import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// 1. Security HTTP Headers
app.use(helmet());

// 2. CORS configuration for frontend
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// 3. Request Body Parsing (with bounded payload size)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 4. API Routes
app.use('/api/health', healthRoutes);

// 5. Root route for basic verification
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to LedgerLine Core API',
    documentation: '/docs',
    healthCheck: '/api/health',
  });
});

// 6. Handle 404
app.use(notFoundHandler);

// 7. Central Error Handler
app.use(errorHandler);

export default app;

