import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const juryTimeTable = sqliteTable("jury_table", {
    day: text().primaryKey(),
    leaveTime: int({ mode: "timestamp" }),
    arriveHomeTime: int({ mode: "timestamp" }),
});
