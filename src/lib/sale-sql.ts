import "server-only";
import { Prisma } from "@prisma/client";
import { saleSqlText } from "./sale";

/** The sale rule (lib/sale.ts) for tagged `db.$queryRaw` templates: `${saleSql("o")}`. */
export const saleSql = (a = "o") => Prisma.raw(saleSqlText(a));
