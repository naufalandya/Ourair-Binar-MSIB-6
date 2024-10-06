"use strict";

const prisma = require("./config/prisma.config");

const express = require("express");
const bodyparser = require("body-parser");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const { v1 } = require("./api/v1.api");
const path = require("path");
const swaggerUI = require("swagger-ui-express");
const YAML = require("yaml");
const fs = require("fs");
const file = fs.readFileSync(`${__dirname}/api-docs.yaml`, "utf-8");
const cors = require("cors");
const compression = require('compression');
const { RedisStore, rateLimit, client } = require('./db/redis')


require("dotenv").config();
require("./utils/instrument");
const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });

client.connect();

client.on('error', (err) => {
  if (err.code === 'ECONNRESET') {
    console.error('Connection reset by server, attempting to reconnect...');
    client.connect().catch(console.error);
  } else {
    console.error('Redis client error:', err);
  }
});

const swaggerDocument = YAML.parse(file);

var corsOptions = {
  origin: [
    "https://ourair-admin.vercel.app",
    "https://ourair.tech",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3001",
    "http://localhost:3000",
    "https://ourair.my.id",
    "https://accounts.google.com",
    "https://bw2nj1xt-3001.asse.devtunnels.ms"
  ],
  optionsSuccessStatus: 200,
  credentials: true
};


const limiterfast = rateLimit({
  windowMs: 60 * 1000,
max: 20, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req, res) => req.ip, // Use IP address to identify clients
  handler: (req, res, next, options) => {
      res.status(options.statusCode).json({
          message: 'Anda terlalu banyak melakukan permintaan. Silakan coba lagi nanti.'
      });
  },
store: new RedisStore({
  sendCommand: (...args) => client.sendCommand(args),
}),
})


require("dotenv").config();
const app = express()
  .set("trust proxy", 1)
  .use(cors(corsOptions))
  .use((req, res, next) => {
    console.log('CORS headers:', res.getHeaders());
    next();
  })
  // .use(limiter)
  .use(cookieParser())
  .use(compression())
  .set("views", path.join(__dirname, "./views"))
  .use("/custom.css", express.static(path.join(__dirname, "./style.css")))
  .use(
    "/v1/api-docs",
    swaggerUI.serve,
    swaggerUI.setup(swaggerDocument, {
      customCssUrl: "/custom.css",
    })
  )
  .use(logger("dev"))
  .set("view engine", "ejs")
  .use(express.json())
  .use(bodyparser.json())
  .use(express.urlencoded({ extended: true }))
  .use(bodyparser.urlencoded({ extended: true }))
  .use("/api/v1", v1)
  .get("/apasih", (req, res) => {
    res.render("websocket");
  })
  .get("/hapus", async (req, res)=> {
    try {
      const deletedUsers = await prisma.flights.deleteMany();
;
      return res.json({status : true})
    } catch (err) {
      throw err
    }
  })
  .get("/api/v1/donation", limiterfast, async (req, res) => {
      try {
        const dailyDonations = await prisma.$queryRaw`
            SELECT DATE_TRUNC('day', created_at) AS day, CAST(SUM(donation) AS INTEGER) AS total_donation
            FROM transactions
            WHERE created_at >= CURRENT_DATE - INTERVAL '7' DAY AND status = true
            GROUP BY DATE_TRUNC('day', created_at)
        `;

        const weeklyDonations = await prisma.$queryRaw`
            SELECT DATE_TRUNC('week', created_at) AS week, CAST(SUM(donation) AS INTEGER) AS total_donation
            FROM transactions
            WHERE created_at >= CURRENT_DATE - INTERVAL '30' DAY AND status = true
            GROUP BY DATE_TRUNC('week', created_at)
        `;

        const monthlyDonations = await prisma.$queryRaw`
            SELECT DATE_TRUNC('month', created_at) AS month, CAST(SUM(donation) AS INTEGER) AS total_donation
            FROM transactions
            WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) AND status = true
            GROUP BY DATE_TRUNC('month', created_at)
        `;

        const formattedDailyDonations = dailyDonations.map(({ day, total_donation }) => ({
            day,
            total_donation: total_donation.toString(),
        }));

        const formattedWeeklyDonations = weeklyDonations.map(({ week, total_donation }) => ({
            week,
            total_donation: total_donation.toString(),
        }));

        const formattedMonthlyDonations = monthlyDonations.map(({ month, total_donation }) => ({
            month,
            total_donation: total_donation.toString(),
        }));

        return res.json({
            status: true,
            message: 'success',
            data: {
                dailyDonations: formattedDailyDonations,
                weeklyDonations: formattedWeeklyDonations,
                monthlyDonations: formattedMonthlyDonations,
            }
        });
    
      } catch (error) {
          throw error
    }
  }
  )
  .get("/email", (req, res) => {
    const data = { otp: "247824", name: "Our Air wow" };
    res.render("email", data);
  })
  .get("/", limiterfast, (req, res) => {
    return res.status(200).json({
      status: true,
      message: "hello world",
    });
  })

  .use(function onError(err, req, res, next) {

    res.statusCode = 500;
    res.end(res.sentry + "\n");
  })
  //500
  .use((err, req, res, next) => {
    res.status(500).json({
      status: false,
      message: err.message,
      data: null,
    });
  })

  //404
  .use((req, res, next) => {
    res.status(404).json({
      status: false,
      message: `are you lost? ${req.method} ${req.url} is not registered!`,
      data: null,
    });
  });


Sentry.setupExpressErrorHandler(app);


app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});


// CRON Section
const seedFlight = require("./seeds/cron-flight");
const cron = require('node-cron');

cron.schedule('0 0 * * *', () => {
  seedFlight()
});

module.exports = app