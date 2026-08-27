const prisma = require("../../config/db");

const getMe = async (userUuid) => {
  return prisma.user.findUnique({
    where: { uuid: userUuid },
    // An explicit select, never the whole row: the User model holds the
    // password hash, the TOTP secret and the pending TOTP secret, and a
    // `select`-less query on this table would serialise all three to the client.
    select: {
      uuid: true,
      email: true,
      role: true,
      createdAt: true,
      twoFactorEnabled: true,
      profile: { select: { name: true, bio: true, avatarUrl: true } },
    },
  });
};

const updateProfile = async (userUuid, patch) => {
  const user = await prisma.user.findUnique({ where: { uuid: userUuid }, select: { id: true } });
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  // Only fields actually present in the request are written, so a partial
  // update cannot blank out the ones it left out.
  const data = {};
  for (const field of ["name", "bio", "avatarUrl"]) {
    if (patch[field] !== undefined) data[field] = patch[field] || null;
  }

  return prisma.profile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
    select: { name: true, bio: true, avatarUrl: true },
  });
};

module.exports = { getMe, updateProfile };
