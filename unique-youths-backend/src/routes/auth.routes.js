import express from "express";
import crypto from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from "@simplewebauthn/server";
import {
  isoUint8Array
} from "@simplewebauthn/server/helpers";

import {
  loginLimiter,
  otpVerifyLimiter,
  otpSendLimiter
} from "../middleware/rateLimit.js";

import User from "../models/User.js";
import Admin from "../models/Admin.js";
import OTP from "../models/OTP.js";
import Announcement from "../models/Announcement.js";
import AdminActivity from "../models/AdminActivity.js";
import MemberActivity from "../models/MemberActivity.js";

import {
  withExpiry
} from "../utils/announcements.js";

import {
  hashPassword,
  comparePassword,
  issueToken
} from "../utils/auth.js";

import {
  generateOtp,
  hashOtp
} from "../utils/otp.js";

import {
  sendOtpEmail,
  sendNewDeviceAlertEmail
} from "../config/email.js";

import {
  sendOtpSms
} from "../config/sms.js";

import {
  requireAdmin,
  requireMember
} from "../middleware/auth.js";

const router =
  express.Router();

/* ============================================================
 * PASSKEY / WEBAUTHN CONFIGURATION
 * ============================================================ */

const WEBAUTHN_RP_NAME =
  process.env.WEBAUTHN_RP_NAME ||
  "Unique Youth Cooperative Thrift";

const WEBAUTHN_RP_ID =
  process.env.WEBAUTHN_RP_ID ||
  "localhost";

const WEBAUTHN_ORIGINS =
  (
    process.env.WEBAUTHN_ORIGINS ||
    "http://localhost:5173"
  )
    .split(",")
    .map(
      origin =>
        origin.trim()
    )
    .filter(Boolean);

const WEBAUTHN_CHALLENGE_TTL_MS =
  Number(
    process.env.WEBAUTHN_CHALLENGE_TTL_SECONDS ||
      300
  ) * 1000;

function generateWebAuthnUserId() {
  return crypto.randomBytes(
    32
  ).toString("base64url");
}

async function ensureWebAuthnUserId(
  user
) {
  if (
    user.webAuthnUserId
  ) {
    return user.webAuthnUserId;
  }

  user.webAuthnUserId =
    generateWebAuthnUserId();

  await user.save();

  return user.webAuthnUserId;
}

function getWebAuthnConfig() {
  if (
    process.env.NODE_ENV ===
      "production" &&
    (
      !process.env
        .WEBAUTHN_RP_ID ||
      !process.env
        .WEBAUTHN_ORIGINS
    )
  ) {
    throw new Error(
      "WEBAUTHN_RP_ID and WEBAUTHN_ORIGINS must be configured in production"
    );
  }

  return {
    rpName:
      WEBAUTHN_RP_NAME,

    rpID:
      WEBAUTHN_RP_ID,

    origins:
      WEBAUTHN_ORIGINS
  };
}

function publicKeyToUint8Array(
  publicKey
) {
  if (!publicKey) {
    return new Uint8Array();
  }

  return new Uint8Array(
    publicKey
  );
}

/* ============================================================
 * COMMON MEMBER LOGIN COMPLETION
 * ============================================================ */

async function completeMemberLogin(
  user,
  req
) {
  const token =
    issueToken({
      type: "member",
      userId: user._id
    });

  const deviceId =
    String(
      req.body.deviceId ||
        ""
    ).trim();

  if (deviceId) {
    const isKnownDevice =
      user.knownDeviceIds.includes(
        deviceId
      );

    const isFirstLoginEver =
      user.knownDeviceIds.length ===
      0;

    if (!isKnownDevice) {
      await User.updateOne(
        {
          _id:
            user._id
        },
        {
          $addToSet: {
            knownDeviceIds:
              deviceId
          }
        }
      );

      if (!isFirstLoginEver) {
        try {
          await sendNewDeviceAlertEmail(
            {
              to:
                user.email,

              firstName:
                user.firstName
            }
          );
        } catch {
          /*
           * Do not block login because the notification failed.
           */
        }

        await MemberActivity.create({
          user:
            user._id,

          userName:
            `${user.firstName} ${user.lastName}`,

          action:
            "new_device_login",

          detail:
            "Logged in from a device not seen before on this account - an email alert was sent to the member."
        });
      }
    }
  }

  await Announcement.create(
    withExpiry(
      {
        type:
          "general_update",

        description:
          `Welcome back, ${user.firstName}!`,

        user:
          user._id
      },
      5
    )
  );

  await MemberActivity.create({
    user:
      user._id,

    userName:
      `${user.firstName} ${user.lastName}`,

    action:
      "login",

    detail:
      "Logged in"
  });

  await User.updateOne(
    {
      _id:
        user._id
    },
    {
      $set: {
        lastSeenAt:
          new Date(),

        isOnline:
          true
      }
    }
  );

  return {
    token,

    registrationStatus:
      user.registrationStatus
  };
}

/* ============================================================
 * ADMIN BOOTSTRAP
 * ============================================================ */

export async function bootstrapAuthorizedAdmins() {
  const configuredAdmins = [
    {
      email:
        process.env.SUPER_ADMIN_EMAIL
          ?.trim()
          .toLowerCase(),

      username:
        process.env.SUPER_ADMIN_USERNAME
          ?.trim()
          .toLowerCase() ||
        "superadmin",

      password:
        process.env
          .SUPER_ADMIN_INITIAL_PASSWORD,

      role:
        "master_supervisor"
    },

    {
      email:
        process.env.SUPERVISOR_EMAIL
          ?.trim()
          .toLowerCase(),

      username:
        process.env.SUPERVISOR_USERNAME
          ?.trim()
          .toLowerCase() ||
        "supervisor",

      password:
        process.env
          .SUPERVISOR_INITIAL_PASSWORD,

      role:
        "staff_auditor"
    }
  ];

  for (
    const config of configuredAdmins
  ) {
    if (
      !config.email ||
      !config.password
    ) {
      throw new Error(
        `${config.role} admin configuration is incomplete. Check the environment variables.`
      );
    }

    if (
      config.password.length <
      12
    ) {
      throw new Error(
        `${config.role} initial password must be at least 12 characters.`
      );
    }

    const existingByEmail =
      await Admin.findOne({
        email:
          config.email
      });

    if (
      existingByEmail
    ) {
      if (
        existingByEmail.role !==
        config.role
      ) {
        throw new Error(
          `Admin ${config.email} already exists with role "${existingByEmail.role}", expected "${config.role}".`
        );
      }

      continue;
    }

    const existingByUsername =
      await Admin.findOne({
        username:
          config.username
      });

    if (
      existingByUsername
    ) {
      throw new Error(
        `Admin username "${config.username}" is already in use.`
      );
    }

    const admin =
      await Admin.create({
        email:
          config.email,

        username:
          config.username,

        password:
          await hashPassword(
            config.password
          ),

        role:
          config.role,

        isActive:
          true
      });

    console.log(
      `Initialized ${admin.role}: ${admin.email}`
    );
  }
}

/* ============================================================
 * MEMBER OTP
 * ============================================================ */

async function sendOtp(
  user
) {
  const cooldown =
    Number(
      process.env
        .OTP_RESEND_COOLDOWN_SECONDS ||
        60
    );

  const last =
    await OTP.findOne({
      user:
        user._id
    }).sort({
      createdAt:
        -1
    });

  if (
    last &&
    (
      Date.now() -
        last.createdAt.getTime()
    ) /
      1000 <
      cooldown
  ) {
    const wait =
      Math.ceil(
        cooldown -
          (
            Date.now() -
              last.createdAt.getTime()
          ) /
            1000
      );

    const error =
      new Error(
        `Please wait ${wait} seconds before requesting another OTP`
      );

    error.status =
      429;

    throw error;
  }

  const channel =
    user.preferredOtpChannel ===
    "sms"
      ? "sms"
      : "email";

  const otp =
    generateOtp();

  const expiresAt =
    new Date(
      Date.now() +
        Number(
          process.env
            .OTP_EXPIRES_MINUTES ||
            10
        ) *
          60 *
          1000
    );

  await OTP.create({
    user:
      user._id,

    email:
      user.email,

    channel,

    otpHash:
      hashOtp(
        otp
      ),

    expiresAt
  });

  if (
    channel ===
    "sms"
  ) {
    await sendOtpSms({
      to:
        user.primaryPhone,

      otp
    });
  } else {
    await sendOtpEmail({
      to:
        user.email,

      otp
    });
  }
}

/* ============================================================
 * MEMBER REGISTRATION
 * ============================================================ */

router.post(
  "/register",
  otpSendLimiter,
  async (
    req,
    res
  ) => {
    try {
      const {
        firstName,
        lastName,
        username,
        email,
        password,
        primaryPhone,
        residentialAddress,
        bank
      } = req.body;

      if (
        !firstName ||
        !lastName ||
        !username ||
        !email ||
        !password ||
        !primaryPhone ||
        !residentialAddress ||
        !bank?.bankName ||
        !bank?.accountNumber ||
        !bank?.accountName
      ) {
        return res
          .status(400)
          .json({
            message:
              "All required registration fields must be supplied"
          });
      }

      if (
        password.length <
        8
      ) {
        return res
          .status(400)
          .json({
            message:
              "Password must be at least 8 characters"
          });
      }

      const otpChannel =
        req.body
          .otpChannel ===
        "sms"
          ? "sms"
          : "email";

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const normalizedUsername =
        username
          .trim()
          .toLowerCase();

      const exists =
        await User.findOne({
          $or: [
            {
              email:
                normalizedEmail
            },
            {
              username:
                normalizedUsername
            },
            {
              primaryPhone
            }
          ]
        });

      if (
        exists
      ) {
        return res
          .status(409)
          .json({
            message:
              "Email, username, or phone already exists"
          });
      }

      const user =
        await User.create({
          firstName:
            firstName.trim(),

          lastName:
            lastName.trim(),

          username:
            normalizedUsername,

          email:
            normalizedEmail,

          password:
            await hashPassword(
              password
            ),

          primaryPhone,

          residentialAddress,

          bank,

          preferredOtpChannel:
            otpChannel,

          registrationStatus:
            "pending_otp"
        });

      try {
        await sendOtp(
          user
        );
      } catch (
        error
      ) {
        await User.findByIdAndDelete(
          user._id
        );

        throw error;
      }

      return res
        .status(201)
        .json({
          message:
            otpChannel ===
            "sms"
              ? "Registration started. Check your phone for the OTP."
              : "Registration started. Check your email for the OTP.",

          userId:
            user._id,

          otpChannel
        });
    } catch (
      error
    ) {
      return res
        .status(
          error.status ||
            500
        )
        .json({
          message:
            error.message ||
            "Registration failed"
        });
    }
  }
);

/* ============================================================
 * VERIFY OTP
 * ============================================================ */

router.post(
  "/verify-otp",
  otpVerifyLimiter,
  async (
    req,
    res
  ) => {
    try {
      const {
        userId,
        otp
      } =
        req.body;

      if (
        !userId ||
        !otp
      ) {
        return res
          .status(400)
          .json({
            message:
              "User ID and OTP are required"
          });
      }

      const record =
        await OTP.findOne({
          user:
            userId,

          verified:
            false
        }).sort({
          createdAt:
            -1
        });

      if (
        !record ||
        record.expiresAt <=
          new Date()
      ) {
        return res
          .status(400)
          .json({
            message:
              "OTP is invalid or expired"
          });
      }

      if (
        record.attempts >=
        Number(
          process.env
            .OTP_MAX_ATTEMPTS ||
            5
        )
      ) {
        return res
          .status(429)
          .json({
            message:
              "Maximum OTP attempts exceeded"
          });
      }

      record.attempts +=
        1;

      if (
        record.otpHash !==
        hashOtp(
          otp
        )
      ) {
        await record.save();

        return res
          .status(400)
          .json({
            message:
              "Incorrect OTP"
          });
      }

      record.verified =
        true;

      await record.save();

      const user =
        await User.findByIdAndUpdate(
          userId,
          {
            emailVerifiedAt:
              new Date()
          },
          {
            new: true
          }
        );

      if (
        !user
      ) {
        return res
          .status(404)
          .json({
            message:
              "User not found"
          });
      }

      const registrationToken =
        issueToken(
          {
            type:
              "registration",

            userId:
              user._id
          },
          {
            expiresIn:
              process.env
                .REGISTRATION_TOKEN_EXPIRES_IN ||
              "45m"
          }
        );

      return res.json({
        message:
          "Email verified",

        registrationToken
      });
    } catch (
      error
    ) {
      return res
        .status(500)
        .json({
          message:
            error.message ||
            "OTP verification failed"
        });
    }
  }
);

/* ============================================================
 * RESEND OTP
 * ============================================================ */

router.post(
  "/resend-otp",
  otpSendLimiter,
  async (
    req,
    res
  ) => {
    try {
      const {
        userId
      } =
        req.body;

      if (
        !userId
      ) {
        return res
          .status(400)
          .json({
            message:
              "User ID is required"
          });
      }

      const user =
        await User.findById(
          userId
        );

      if (
        !user
      ) {
        return res
          .status(404)
          .json({
            message:
              "User not found"
          });
      }

      if (
        user.emailVerifiedAt
      ) {
        return res
          .status(400)
          .json({
            message:
              "Email already verified"
          });
      }

      await sendOtp(
        user
      );

      return res.json({
        message:
          user.preferredOtpChannel ===
          "sms"
            ? "A new OTP was sent to your phone"
            : "A new OTP was sent to your email"
      });
    } catch (
      error
    ) {
      return res
        .status(
          error.status ||
            500
        )
        .json({
          message:
            error.message ||
            "Unable to resend OTP"
        });
    }
  }
);

/* ============================================================
 * MEMBER LOGIN (FIXED)
 * ============================================================ */

router.post(
  "/login",
  loginLimiter,
  async (
    req,
    res
  ) => {
    try {
      const identifier =
        String(
          req.body.usernameOrEmail ||
            req.body.username ||
            req.body.email ||
            ""
        )
          .trim()
          .toLowerCase();

      const password =
        req.body.password;

      if (
        !identifier ||
        !password
      ) {
        return res
          .status(400)
          .json({
            message:
              "Email/username and password are required"
          });
      }

      const user =
        await User.findOne({
          $or: [
            {
              email:
                identifier
            },
            {
              username:
                identifier
            }
          ]
        });

      if (
        !user
      ) {
        return res
          .status(401)
          .json({
            message:
              "Invalid credentials"
          });
      }

      const passwordMatches =
        await comparePassword(
          password,
          user.password
        );

      if (
        !passwordMatches
      ) {
        return res
          .status(401)
          .json({
            message:
              "Invalid credentials"
          });
      }

      if (
        !user.emailVerifiedAt
      ) {
        return res
          .status(403)
          .json({
            message:
              "Please verify your email before logging in"
          });
      }

      // ✅ Block incomplete registrations
      if (
        user.registrationStatus ===
        "pending_otp"
      ) {
        return res
          .status(403)
          .json({
            message:
              "Please complete your registration before logging in."
          });
      }

      if (
        user.registrationStatus ===
        "rejected"
      ) {
        return res
          .status(403)
          .json({
            message:
              user.guarantorRejectionReason
                ? `Your registration was not approved: ${user.guarantorRejectionReason}`
                : "Your registration was not approved. Contact an administrator."
          });
      }

      const loginResult =
        await completeMemberLogin(
          user,
          req
        );

      return res.json({
        message:
          "Login successful",

        token:
          loginResult.token,

        registrationStatus:
          loginResult.registrationStatus
      });
    } catch (
      error
    ) {
      console.error(
        "Member login error:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "Login failed"
        });
    }
  }
);

/* ============================================================
 * MEMBER CHANGE PASSWORD
 * ============================================================ */

router.post(
  "/member/change-password",
  requireMember,
  loginLimiter,
  async (
    req,
    res
  ) => {
    try {
      const {
        currentPassword,
        newPassword,
        confirmPassword
      } = req.body;

      if (
        !currentPassword ||
        !newPassword ||
        !confirmPassword
      ) {
        return res
          .status(400)
          .json({
            message:
              "Current password, new password, and password confirmation are required."
          });
      }

      if (
        typeof newPassword !==
          "string" ||
        newPassword.length <
          8
      ) {
        return res
          .status(400)
          .json({
            message:
              "New password must be at least 8 characters."
          });
      }

      if (
        newPassword !==
        confirmPassword
      ) {
        return res
          .status(400)
          .json({
            message:
              "New password and confirmation do not match."
          });
      }

      const user =
        await User.findById(
          req.auth.userId
        );

      if (
        !user
      ) {
        return res
          .status(404)
          .json({
            message:
              "Member not found."
          });
      }

      const currentPasswordMatches =
        await comparePassword(
          currentPassword,
          user.password
        );

      if (
        !currentPasswordMatches
      ) {
        return res
          .status(401)
          .json({
            message:
              "Current password is incorrect."
          });
      }

      const reusingPassword =
        await comparePassword(
          newPassword,
          user.password
        );

      if (
        reusingPassword
      ) {
        return res
          .status(400)
          .json({
            message:
              "Your new password must be different from your current password."
          });
      }

      user.password =
        await hashPassword(
          newPassword
        );

      await user.save();

      await MemberActivity.create({
        user:
          user._id,

        userName:
          `${user.firstName} ${user.lastName}`,

        action:
          "password_changed",

        detail:
          "Member password was changed successfully."
      });

      return res.json({
        message:
          "Your password has been changed successfully."
      });
    } catch (
      error
    ) {
      console.error(
        "Member password change error:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "Unable to change password."
        });
    }
  }
);

/* ============================================================
 * PASSKEY REGISTRATION OPTIONS
 * ============================================================ */

router.get(
  "/passkey/register/options",
  requireMember,
  loginLimiter,
  async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.auth.userId
        );

      if (
        !user
      ) {
        return res
          .status(404)
          .json({
            message:
              "Member not found"
          });
      }

      if (
        !user.emailVerifiedAt
      ) {
        return res
          .status(403)
          .json({
            message:
              "Email verification is required before registering a passkey."
          });
      }

      if (
        user.registrationStatus ===
        "rejected"
      ) {
        return res
          .status(403)
          .json({
            message:
              "This account is not eligible for passkey registration."
          });
      }

      const {
        rpName,
        rpID
      } =
        getWebAuthnConfig();

      const webAuthnUserId =
        await ensureWebAuthnUserId(
          user
        );

      const excludeCredentials =
        user.passkeys.map(
          passkey => ({
            id:
              passkey.credentialId,

            transports:
              passkey.transports
          })
        );

      const options =
        await generateRegistrationOptions(
          {
            rpName,

            rpID,

            userID:
              isoUint8Array.fromUTF8String(
                webAuthnUserId
              ),

            userName:
              user.username,

            userDisplayName:
              `${user.firstName} ${user.lastName}`,

            attestationType:
              "none",

            excludeCredentials,

            authenticatorSelection:
              {
                residentKey:
                  "required",

                userVerification:
                  "required"
              },

            preferredAuthenticatorType:
              "localDevice",

            supportedAlgorithmIDs:
              [
                -7,
                -257
              ]
          }
        );

      user.passkeyRegistrationChallenge =
        options.challenge;

      user.passkeyRegistrationChallengeExpiresAt =
        new Date(
          Date.now() +
            WEBAUTHN_CHALLENGE_TTL_MS
        );

      await user.save();

      return res.json(
        options
      );
    } catch (
      error
    ) {
      console.error(
        "Passkey registration options error:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            error.message ||
            "Unable to start passkey registration"
        });
    }
  }
);

/* ============================================================
 * PASSKEY REGISTRATION VERIFICATION
 * ============================================================ */

router.post(
  "/passkey/register/verify",
  requireMember,
  loginLimiter,
  async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.auth.userId
        );

      if (
        !user
      ) {
        return res
          .status(404)
          .json({
            message:
              "Member not found"
          });
      }

      const challenge =
        user.passkeyRegistrationChallenge;

      const challengeExpiresAt =
        user.passkeyRegistrationChallengeExpiresAt;

      if (
        !challenge ||
        !challengeExpiresAt ||
        challengeExpiresAt <=
          new Date()
      ) {
        return res
          .status(400)
          .json({
            message:
              "The passkey registration request has expired. Please start again."
          });
      }

      if (
        !req.body ||
        !req.body.id
      ) {
        return res
          .status(400)
          .json({
            message:
              "A passkey credential response is required."
          });
      }

      const {
        rpID,
        origins
      } =
        getWebAuthnConfig();

      let verification;

      try {
        verification =
          await verifyRegistrationResponse(
            {
              response:
                req.body,

              expectedChallenge:
                challenge,

              expectedOrigin:
                origins,

              expectedRPID:
                rpID,

              requireUserVerification:
                true
            }
          );
      } catch (
        error
      ) {
        console.error(
          "Passkey registration verification error:",
          error
        );

        return res
          .status(400)
          .json({
            message:
              error.message ||
              "Passkey registration could not be verified."
          });
      }

      if (
        !verification.verified ||
        !verification.registrationInfo
      ) {
        return res
          .status(400)
          .json({
            message:
              "Passkey registration was not verified."
          });
      }

      const {
        credential,
        credentialDeviceType,
        credentialBackedUp
      } =
        verification.registrationInfo;

      const alreadyExists =
        user.passkeys.some(
          passkey =>
            passkey.credentialId ===
            credential.id
        );

      if (
        alreadyExists
      ) {
        user.passkeyRegistrationChallenge =
          null;

        user.passkeyRegistrationChallengeExpiresAt =
          null;

        await user.save();

        return res
          .status(409)
          .json({
            message:
              "This passkey is already registered on your account."
          });
      }

      user.passkeys.push({
        credentialId:
          credential.id,

        publicKey:
          Buffer.from(
            credential.publicKey
          ),

        counter:
          credential.counter,

        transports:
          credential.transports ||
          [],

        deviceType:
          credentialDeviceType ||
          null,

        backedUp:
          credentialBackedUp ||
          false,

        registeredAt:
          new Date(),

        lastUsedAt:
          null
      });

      user.passkeyRegistrationChallenge =
        null;

      user.passkeyRegistrationChallengeExpiresAt =
        null;

      await user.save();

      await MemberActivity.create({
        user:
          user._id,

        userName:
          `${user.firstName} ${user.lastName}`,

        action:
          "passkey_registered",

        detail:
          "A new biometric/passkey authenticator was registered."
      });

      return res.status(
        201
      ).json({
        message:
          "Biometric login has been enabled on this device.",

        verified:
          true,

        passkeyCount:
          user.passkeys.length
      });
    } catch (
      error
    ) {
      console.error(
        "Passkey registration error:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            error.message ||
            "Passkey registration failed"
        });
    }
  }
);

/* ============================================================
 * DISABLE PASSKEY / BIOMETRIC LOGIN
 * ============================================================ */

router.post(
  "/passkey/disable",
  requireMember,
  loginLimiter,
  async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.auth.userId
        );

      if (!user) {
        return res
          .status(404)
          .json({
            message:
              "Member not found"
          });
      }

      if (
        !user.passkeys ||
        user.passkeys.length === 0
      ) {
        return res.json({
          message:
            "Biometric/passkey login is already disabled.",
          passkeyCount: 0
        });
      }

      const removedCount =
        user.passkeys.length;

      user.passkeys = [];

      user.passkeyRegistrationChallenge =
        null;

      user.passkeyRegistrationChallengeExpiresAt =
        null;

      user.passkeyAuthenticationChallenge =
        null;

      user.passkeyAuthenticationChallengeExpiresAt =
        null;

      await user.save();

      await MemberActivity.create({
        user:
          user._id,

        userName:
          `${user.firstName} ${user.lastName}`,

        action:
          "passkey_disabled",

        detail:
          `Biometric/passkey login was disabled. ${removedCount} registered credential${removedCount === 1 ? "" : "s"} were revoked.`
      });

      return res.json({
        message:
          "Biometric/passkey login has been disabled on this account.",

        passkeyCount:
          0
      });
    } catch (
      error
    ) {
      console.error(
        "Disable passkey error:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "Unable to disable biometric/passkey login."
        });
    }
  }
);

/* ============================================================
 * PASSKEY LOGIN OPTIONS
 * ============================================================ */

router.post(
  "/passkey/login/options",
  loginLimiter,
  async (
    req,
    res
  ) => {
    try {
      const identifier =
        String(
          req.body.usernameOrEmail ||
            req.body.username ||
            req.body.email ||
            ""
        )
          .trim()
          .toLowerCase();

      if (
        !identifier
      ) {
        return res
          .status(400)
          .json({
            message:
              "Email or username is required."
          });
      }

      const user =
        await User.findOne({
          $or: [
            {
              email:
                identifier
            },
            {
              username:
                identifier
            }
          ]
        });

      if (
        !user
      ) {
        return res
          .status(401)
          .json({
            message:
              "Invalid credentials"
          });
      }

      if (
        !user.emailVerifiedAt
      ) {
        return res
          .status(403)
          .json({
            message:
              "Please verify your email before using biometric login."
          });
      }

      if (
        user.registrationStatus ===
        "rejected"
      ) {
        return res
          .status(403)
          .json({
            message:
              user.guarantorRejectionReason
                ? `Your registration was not approved: ${user.guarantorRejectionReason}`
                : "Your registration was not approved. Contact an administrator."
          });
      }

      if (
        !user.passkeys.length
      ) {
        return res
          .status(404)
          .json({
            message:
              "No biometric login is registered for this account yet. Log in with your password and enable biometric login first."
          });
      }

      const {
        rpID
      } =
        getWebAuthnConfig();

      const allowCredentials =
        user.passkeys.map(
          passkey => ({
            id:
              passkey.credentialId,

            transports:
              passkey.transports
          })
        );

      const options =
        await generateAuthenticationOptions(
          {
            rpID,

            allowCredentials,

            userVerification:
              "required"
          }
        );

      user.passkeyAuthenticationChallenge =
        options.challenge;

      user.passkeyAuthenticationChallengeExpiresAt =
        new Date(
          Date.now() +
            WEBAUTHN_CHALLENGE_TTL_MS
        );

      await user.save();

      return res.json(
        options
      );
    } catch (
      error
    ) {
      console.error(
        "Passkey login options error:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            error.message ||
            "Unable to start biometric login"
        });
    }
  }
);

/* ============================================================
 * PASSKEY LOGIN VERIFICATION (FIXED)
 * ============================================================ */

router.post(
  "/passkey/login/verify",
  loginLimiter,
  async (
    req,
    res
  ) => {
    try {
      if (
        !req.body ||
        !req.body.id
      ) {
        return res
          .status(400)
          .json({
            message:
              "A passkey authentication response is required."
          });
      }

      const credentialId =
        String(
          req.body.id
        ).trim();

      const user =
        await User.findOne({
          "passkeys.credentialId":
            credentialId
        });

      if (
        !user
      ) {
        return res
          .status(401)
          .json({
            message:
              "Biometric credential not recognized."
          });
      }

      if (
        !user.emailVerifiedAt
      ) {
        return res
          .status(403)
          .json({
            message:
              "Please verify your email before using biometric login."
          });
      }

      // ✅ Block incomplete registrations for passkey login too
      if (
        user.registrationStatus ===
        "pending_otp"
      ) {
        return res
          .status(403)
          .json({
            message:
              "Please complete your registration before logging in with biometrics."
          });
      }

      if (
        user.registrationStatus ===
        "rejected"
      ) {
        return res
          .status(403)
          .json({
            message:
              user.guarantorRejectionReason
                ? `Your registration was not approved: ${user.guarantorRejectionReason}`
                : "Your registration was not approved. Contact an administrator."
          });
      }

      const challenge =
        user.passkeyAuthenticationChallenge;

      const challengeExpiresAt =
        user.passkeyAuthenticationChallengeExpiresAt;

      if (
        !challenge ||
        !challengeExpiresAt ||
        challengeExpiresAt <=
          new Date()
      ) {
        return res
          .status(400)
          .json({
            message:
              "The biometric login request has expired. Please start again."
          });
      }

      const passkeyIndex =
        user.passkeys.findIndex(
          passkey =>
            passkey.credentialId ===
            credentialId
        );

      if (
        passkeyIndex ===
        -1
      ) {
        return res
          .status(401)
          .json({
            message:
              "Biometric credential not recognized."
          });
      }

      const passkey =
        user.passkeys[
          passkeyIndex
        ];

      const {
        rpID,
        origins
      } =
        getWebAuthnConfig();

      let verification;

      try {
        verification =
          await verifyAuthenticationResponse(
            {
              response:
                req.body,

              expectedChallenge:
                challenge,

              expectedOrigin:
                origins,

              expectedRPID:
                rpID,

              credential:
                {
                  id:
                    passkey.credentialId,

                  publicKey:
                    publicKeyToUint8Array(
                      passkey.publicKey
                    ),

                  counter:
                    passkey.counter,

                  transports:
                    passkey.transports
                },

              requireUserVerification:
                true
            }
          );
      } catch (
        error
      ) {
        console.error(
          "Passkey authentication verification error:",
          error
        );

        return res
          .status(401)
          .json({
            message:
              "Biometric verification failed."
          });
      }

      if (
        !verification.verified
      ) {
        return res
          .status(401)
          .json({
            message:
              "Biometric verification failed."
          });
      }

      passkey.counter =
        verification
          .authenticationInfo
          .newCounter;

      passkey.lastUsedAt =
        new Date();

      user.passkeyAuthenticationChallenge =
        null;

      user.passkeyAuthenticationChallengeExpiresAt =
        null;

      await user.save();

      const loginResult =
        await completeMemberLogin(
          user,
          req
        );

      await MemberActivity.create({
        user:
          user._id,

        userName:
          `${user.firstName} ${user.lastName}`,

        action:
          "passkey_login",

        detail:
          "Authenticated successfully using a registered biometric/passkey credential."
      });

      return res.json({
        message:
          "Biometric login successful",

        token:
          loginResult.token,

        registrationStatus:
          loginResult.registrationStatus
      });
    } catch (
      error
    ) {
      console.error(
        "Passkey authentication error:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "Biometric login failed"
        });
    }
  }
);

/* ============================================================
 * ADMIN LOGIN
 * ============================================================ */

router.post(
  "/admin/login",
  loginLimiter,
  async (
    req,
    res
  ) => {
    try {
      const identifier =
        String(
          req.body.usernameOrEmail ||
            req.body.username ||
            req.body.email ||
            ""
        )
          .trim()
          .toLowerCase();

      const password =
        req.body.password;

      if (
        !identifier ||
        !password
      ) {
        return res
          .status(400)
          .json({
            message:
              "Username/email and password are required"
          });
      }

      const authorizedEmails = [
        process.env.SUPER_ADMIN_EMAIL
          ?.trim()
          .toLowerCase(),

        process.env.SUPERVISOR_EMAIL
          ?.trim()
          .toLowerCase()
      ].filter(Boolean);

      if (
        !authorizedEmails.length
      ) {
        return res
          .status(503)
          .json({
            message:
              "Administrator authentication is not configured"
          });
      }

      const admin =
        await Admin.findOne({
          isActive:
            true,

          $or: [
            {
              email:
                identifier
            },

            {
              username:
                identifier
            }
          ]
        });

      if (
        !admin
      ) {
        return res
          .status(401)
          .json({
            message:
              "Invalid credentials"
          });
      }

      if (
        !authorizedEmails.includes(
          admin.email
        )
      ) {
        return res
          .status(403)
          .json({
            message:
              "Administrator account is not authorized"
          });
      }

      const passwordMatches =
        await comparePassword(
          password,
          admin.password
        );

      if (
        !passwordMatches
      ) {
        return res
          .status(401)
          .json({
            message:
              "Invalid credentials"
          });
      }

      const token =
        issueToken({
          type:
            "admin",

          adminId:
            admin._id,

          role:
            admin.role
        });

      await AdminActivity.create({
        admin:
          admin._id,

        adminName:
          admin.username,

        action:
          "login",

        detail:
          `Logged in (${admin.role.replace(
            "_",
            " "
          )})`
      });

      return res.json({
        token,

        admin: {
          id:
            admin._id,

          email:
            admin.email,

          username:
            admin.username,

          role:
            admin.role
        }
      });
    } catch (
      error
    ) {
      console.error(
        "Admin login error:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "Login failed"
        });
    }
  }
);

/* ============================================================
 * ADMIN LOGOUT
 * ============================================================ */

router.post(
  "/admin/logout",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const admin =
        await Admin.findById(
          req.auth.adminId
        );

      await AdminActivity.create({
        admin:
          req.auth.adminId,

        adminName:
          admin?.username ||
          "Unknown admin",

        action:
          "logout",

        detail:
          "Logged out"
      });

      return res.json({
        message:
          "Logged out"
      });
    } catch (
      error
    ) {
      return res
        .status(500)
        .json({
          message:
            "Could not record logout"
        });
    }
  }
);

/* ============================================================
 * MEMBER LOGOUT
 * ============================================================ */

router.post(
  "/member/logout",
  requireMember,
  async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.auth.userId
        );

      await MemberActivity.create({
        user:
          req.auth.userId,

        userName:
          user
            ? `${user.firstName} ${user.lastName}`
            : "Unknown member",

        action:
          "logout",

        detail:
          "Logged out"
      });

      if (
        user
      ) {
        user.lastSeenAt =
          new Date(0);

        user.isOnline =
          false;

        await user.save();
      }

      return res.json({
        message:
          "Logged out"
      });
    } catch (
      error
    ) {
      return res
        .status(500)
        .json({
          message:
            "Could not record logout"
        });
    }
  }
);

export default router;