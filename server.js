const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile, Postman, curl) or any localhost/127.0.0.1 port
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === clientUrl) {
      return callback(null, true);
    }
    return callback(null, origin);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role', 'x-user-id', 'x-user-name'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'MedGate Backend API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/auth', authRoutes);
app.use('/patients', patientRoutes);
app.use('/audit-log', auditLogRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[MedGate Backend] Server running on port ${PORT}`);
    console.log(`[MedGate Backend] Allowed CORS Origin: ${clientUrl}`);
  });
}

module.exports = app;
