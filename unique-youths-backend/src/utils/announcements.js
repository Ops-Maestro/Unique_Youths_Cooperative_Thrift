/*
 * System-generated notices (welcome messages, "user just joined" broadcasts,
 * profile reminders, welcome-back greetings) should clear themselves out
 * after a while instead of piling up forever - unlike admin broadcasts from
 * the Broadcast Engine, which stay until an admin deletes them.
 *
 * Any announcement created with `expiresAt` set will be removed automatically
 * by MongoDB's TTL monitor (see the index on Announcement.expiresAt) once
 * that time passes - no cron job needed.
 */
export function withExpiry(fields, minutes = 5) {
  return { ...fields, expiresAt: new Date(Date.now() + minutes * 60 * 1000) };
}
