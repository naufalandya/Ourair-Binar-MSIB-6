'use strict'


const prisma = require("../../../config/prisma.config")
const { ErrorWithStatusCode } = require('./../../../middleware/errorHandler');

const verifyOTP = async (email, otp) => {
    try {
        const user = await prisma.users.findUnique({
            where: { email: email },
            include: {
                otps: {
                    where: {
                        otp_code: otp,
                        expired_at: {
                            gte: new Date(),
                        },
                    },
                },
            },
        });

        if (user && user.otps.length > 0) {
            //;

            await prisma.users.update({
                where: { id: user.id },
                data: { is_Verified: true },
            });

            return true

            //;
        } else {

            throw new ErrorWithStatusCode("Invalid or expired OTP", 200)
        }

    } catch (error) {
        throw error
    }
};

module.exports = { verifyOTP }