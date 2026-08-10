import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const hashPassword = password => bcrypt.hash(password, 12);
export const comparePassword = (password, hash) => bcrypt.compare(password, hash);
export function issueToken(payload, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: options.expiresIn || process.env.JWT_EXPIRES_IN || "1d"
  });
}