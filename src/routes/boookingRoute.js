'use strict'

const { createPassengerController } = require("../features/booking/controllers/passengerController")
const { testwebsocket } = require("../features/booking/controllers/sendnotif")
const { sanitizeBody, validatePassengers } = require("../validators/bodyValidator")
const { checkRole, verifyToken } = require('../features/auth/controllers/whoAmI');

const booking = require("express").Router()
    // .post("/create", verifyToken, sanitizeBody(['passengers', 'baby', 'booker']), validatePassengers, checkRole(['USER']), createPassengerController)
    .post("/create", verifyToken, sanitizeBody(['passengers', 'baby', 'booker', 'donation']), checkRole(["ADMIN", 'USER']), createPassengerController)
    .get('/test-websocket', testwebsocket)

module.exports = { booking };