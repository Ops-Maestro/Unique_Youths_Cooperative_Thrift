import mongoose from "mongoose";

const passkeySchema =
  new mongoose.Schema(
    {
      credentialId: {
        type: String,
        required: true
      },

      /*
       * Public key bytes returned by WebAuthn registration.
       *
       * This is safe to store on the server. The corresponding
       * private key never leaves the user's authenticator/device.
       */
      publicKey: {
        type: Buffer,
        required: true
      },

      /*
       * WebAuthn signature counter.
       *
       * Updated after every successful authentication.
       */
      counter: {
        type: Number,
        required: true,
        default: 0,
        min: 0
      },

      /*
       * How the browser/native platform can communicate with
       * the authenticator.
       */
      transports: {
        type: [String],
        default: []
      },

      /*
       * Whether this credential is a single-device credential
       * or a multi-device/synced passkey.
       */
      deviceType: {
        type: String,
        default: null
      },

      backedUp: {
        type: Boolean,
        default: false
      },

      registeredAt: {
        type: Date,
        default: Date.now
      },

      lastUsedAt: {
        type: Date,
        default: null
      }
    },
    {
      _id: false
    }
  );

const userSchema =
  new mongoose.Schema(
    {
      firstName: {
        type: String,
        required: true,
        trim: true
      },

      lastName: {
        type: String,
        required: true,
        trim: true
      },

      username: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
      },

      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
      },

      password: {
        type: String,
        required: true
      },

      primaryPhone: {
        type: String,
        required: true,
        unique: true,
        trim: true
      },

      residentialAddress: {
        type: String,
        required: true
      },

      bank: {
        bankName: {
          type: String,
          required: true
        },

        accountNumber: {
          type: String,
          required: true
        },

        accountName: {
          type: String,
          required: true
        }
      },

      /*
       * Registration lifecycle:
       *
       * pending_otp
       * awaiting_guarantor_review
       * awaiting_slot_assignment
       * active
       * rejected
       */
      registrationStatus: {
        type: String,

        enum: [
          "pending_otp",
          "awaiting_guarantor_review",
          "awaiting_slot_assignment",
          "active",
          "rejected"
        ],

        default:
          "pending_otp"
      },

      emailVerifiedAt: Date,

      rulesAcceptedAt: Date,

      /*
       * Chosen once at registration.
       *
       * Email is the free/default channel.
       * SMS is opt-in.
       */
      preferredOtpChannel: {
        type: String,

        enum: [
          "email",
          "sms"
        ],

        default:
          "email"
      },

      guarantorName: String,

      guarantorPhone: String,

      guarantorVerifiedAt: Date,

      guarantorVerifiedBy: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: "Admin"
      },

      guarantorRejectionReason:
        String,

      /*
       * Profile extras.
       */
      avatarDataUrl: String,

      dateOfBirthDay: {
        type: Number,
        min: 1,
        max: 31
      },

      dateOfBirthMonth: {
        type: Number,
        min: 1,
        max: 12
      },

      profileCompletedAt: Date,

      /*
       * Authenticated activity/session state.
       */
      lastSeenAt: Date,

      isOnline: {
        type: Boolean,
        default: false
      },

      /*
       * Device IDs seen on successful password logins.
       */
      knownDeviceIds: {
        type: [String],
        default: []
      },

      // ============================================================
      // PASSKEY / WEBAUTHN
      // ============================================================

      /*
       * A random, non-PII identifier used as the WebAuthn user ID.
       *
       * This is deliberately NOT the email address, username, or any
       * other personally identifying value.
       */
      webAuthnUserId: {
        type: String,
        unique: true,
        sparse: true
      },

      /*
       * Registered biometric/passkey credentials.
       *
       * Multiple credentials are supported so a member can register
       * more than one device/authenticator later.
       */
      passkeys: {
        type: [passkeySchema],
        default: []
      },

      /*
       * Registration challenge currently waiting for verification.
       *
       * Only the latest request is accepted.
       */
      passkeyRegistrationChallenge: {
        type: String,
        default: null
      },

      passkeyRegistrationChallengeExpiresAt: {
        type: Date,
        default: null
      },

      /*
       * Authentication challenge currently waiting for verification.
       *
       * Only the latest request is accepted.
       */
      passkeyAuthenticationChallenge: {
        type: String,
        default: null
      },

      passkeyAuthenticationChallengeExpiresAt: {
        type: Date,
        default: null
      }
    },
    {
      timestamps: true
    }
  );

export default mongoose.model(
  "User",
  userSchema
);