require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { readSecret } = require("../config/secrets");

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
  /**
   * Lower-cased to match how the login path stores and looks up addresses.
   *
   * auth.service normalises the email on both register and login, so an
   * ADMIN_EMAIL with any capital letter would seed a row that the login query
   * can never find — the sign-in fails with "Invalid email or password" even
   * though the password is correct, which is close to undiagnosable.
   */
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  // Also honours ADMIN_PASSWORD_FILE, so a mounted secret can seed a
  // production database without the value ever entering the environment.
  const password = readSecret("ADMIN_PASSWORD") || "";

  if (!email || !password) {
    console.error(
      "\nADMIN_EMAIL and ADMIN_PASSWORD must be set in .env to seed the admin. Skipping.\n"
    );
    return;
  }

  if (isWeakPassword(password)) {
    const warning =
      "ADMIN_PASSWORD looks weak. Use a strong, unique value " +
      "(12+ chars, mixed character types, no common words or sequences), and enable 2FA " +
      "on the admin account after first login.";

    // A weak admin password in production is not a warning, it is the whole
    // attack. The seed refuses rather than creating an account that a
    // dictionary attack would open — and the account it creates has every
    // administrative privilege in the system.
    if (process.env.NODE_ENV === "production") {
      console.error(`\nRefusing to seed: ${warning}\n`);
      process.exitCode = 1;
      return;
    }
    console.warn(`\nWARNING: ${warning}\n`);
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
