import crypto from "crypto";
export const generateOtp = () => String(crypto.randomInt(100000,1000000));
export const hashOtp = otp => crypto.createHash("sha256").update(String(otp)).digest("hex");
