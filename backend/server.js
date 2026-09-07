require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const prayerRoutes = require('./routes/prayerRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const worldCityRoutes = require('./routes/worldCityRoutes');

const app = express();

app.use(cors());
app.use(express.json());

connectDB();

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'A2salah API running' });
});

app.use('/api/prayer', prayerRoutes);
app.use('/api/reminders', reminderRoutes);


// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`A2salah backend listening on port ${PORT}`));
