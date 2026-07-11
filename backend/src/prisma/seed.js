require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

// generic password-strength heuristic — judges any value by its shape, so no
// specific password is ever hardcoded or printed
function isWeakPassword(pw = "") {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const hasRepeats = /(.)\1{3,}/.test(pw); // 4+ identical chars in a row
  const hasSequence = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(pw);
  const commonWord = /pass|admin|login|secret|welcome|qwerty|letmein/i.test(pw);
  return pw.length < 12 || classes < 3 || hasRepeats || hasSequence || commonWord;
}

async function main() {
  const email = process.env.ADMIN_EMAIL || "";
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    console.error(
      "\nADMIN_EMAIL and ADMIN_PASSWORD must be set in .env to seed the admin. Skipping.\n"
    );
    return;
  }

  if (isWeakPassword(password)) {
    console.warn(
      "\n WARNING: ADMIN_PASSWORD looks weak. Use a strong, unique value in .env " +
        "(12+ chars, mixed character types, no common words/sequences), and enable 2FA " +
        "on the admin account after first login.\n"
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      email,
      password: hashed,
      role: "ADMIN",
      profile: {
        create: { name: "Anuj Chauhan" },
      },
    },
  });

  console.log(`Admin created: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
