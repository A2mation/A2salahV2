const mongoose = require('mongoose');

const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

const reminderSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true }, // e.g. "Iqama", "Tahajjud", "Prepare for prayer"
    prayer: { type: String, enum: PRAYER_KEYS, required: true },
    // Minutes relative to the prayer time. Negative = before, positive = after, 0 = at the prayer time.
    offsetMinutes: { type: Number, required: true, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Reminder = mongoose.model('Reminder', reminderSchema);
Reminder.PRAYER_KEYS = PRAYER_KEYS;

module.exports = Reminder;
