const express = require('express');
const {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  deleteAllReminders,
} = require('../controllers/reminderController');

const router = express.Router();

router.get('/', getReminders);
router.post('/', createReminder);
router.delete('/', deleteAllReminders);
router.put('/:id', updateReminder);
router.delete('/:id', deleteReminder);

module.exports = router;
