// const express = require('express');
// const { getToday } = require('../controllers/prayerController');

// const router = express.Router();

// router.get('/today', getToday);

// module.exports = router;




const express = require('express');
const { getToday, getMonth, getDayRows } = require('../controllers/prayerController');

const router = express.Router();

router.get('/today', getToday);
router.get('/month', getMonth);
router.get('/day-rows', getDayRows); // new 4-row (azan/jamat) long format

module.exports = router;