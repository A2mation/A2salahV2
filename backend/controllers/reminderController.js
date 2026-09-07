const Reminder = require('../models/Reminder');

// @route GET /api/reminders
const getReminders = async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ createdAt: -1 });
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route POST /api/reminders
const createReminder = async (req, res) => {
  try {
    const { label, prayer, offsetMinutes } = req.body;

    if (!label || !prayer) {
      return res.status(400).json({ message: 'label and prayer are required' });
    }
    if (!Reminder.PRAYER_KEYS.includes(prayer)) {
      return res.status(400).json({ message: `prayer must be one of: ${Reminder.PRAYER_KEYS.join(', ')}` });
    }

    const reminder = await Reminder.create({
      label,
      prayer,
      offsetMinutes: Number.isFinite(offsetMinutes) ? offsetMinutes : 0,
    });

    res.status(201).json(reminder);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route PUT /api/reminders/:id
const updateReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) return res.status(404).json({ message: 'Reminder not found' });

    const { label, prayer, offsetMinutes, enabled } = req.body;

    if (label !== undefined) reminder.label = label;
    if (prayer !== undefined) {
      if (!Reminder.PRAYER_KEYS.includes(prayer)) {
        return res.status(400).json({ message: `prayer must be one of: ${Reminder.PRAYER_KEYS.join(', ')}` });
      }
      reminder.prayer = prayer;
    }
    if (offsetMinutes !== undefined) reminder.offsetMinutes = offsetMinutes;
    if (enabled !== undefined) reminder.enabled = enabled;

    await reminder.save();
    res.json(reminder);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route DELETE /api/reminders/:id
const deleteReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findByIdAndDelete(req.params.id);
    if (!reminder) return res.status(404).json({ message: 'Reminder not found' });
    res.json({ message: 'Reminder deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route DELETE /api/reminders — used by the "⋮ > Delete all" menu
const deleteAllReminders = async (req, res) => {
  try {
    await Reminder.deleteMany({});
    res.json({ message: 'All reminders deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getReminders, createReminder, updateReminder, deleteReminder, deleteAllReminders };
