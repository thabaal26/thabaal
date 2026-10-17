// Gives the QA app's test logins a password so they can be used in a normal browser. QA database only (localhost:5434).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const url = "postgresql://postgres:test@localhost:5434/thabaal_qa";
if (!/@localhost:5434\//.test(url)) throw new Error("QA database only");
const db = new PrismaClient({ datasources: { db: { url } } });
const passwordHash = await bcrypt.hash("qa-test-123", 12);
const r = await db.user.updateMany({ where: { OR: [{ email: { endsWith: "@qa.test" } }, { email: { endsWith: "@qaother.test" } }] }, data: { passwordHash } });
console.log(`updated ${r.count} QA logins`);
await db.$disconnect();
