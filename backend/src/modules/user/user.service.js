const prisma = require("../../config/db");

const getMe = async (userUuid) => {
  return prisma.user.findUnique({
    where: { uuid: userUuid },
    select: {
      uuid: true,
      email: true,
      role: true,
      createdAt: true,
      profile: { select: { name: true, bio: true, avatarUrl: true } },
    },
  });
};

const updateProfile = async (userUuid, { name, bio, avatarUrl }) => {
  const user = await prisma.user.findUnique({ where: { uuid: userUuid }, select: { id: true } });
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }
  return prisma.profile.upsert({
    where: { userId: user.id },
    update: { name, bio, avatarUrl },
    create: { userId: user.id, name, bio, avatarUrl },
    select: { name: true, bio: true, avatarUrl: true },
  });
};

module.exports = { getMe, updateProfile };
