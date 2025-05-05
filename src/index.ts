import express from "express";
import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { juryTimeTable } from "./db/schema";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import puppeteer from "puppeteer";
import { systemPrompt } from "./util/prompt";

const app = express();
const PORT = 6543;

const db = drizzle(process.env.DB_FILE_NAME!);
type JuryTimeTable = typeof juryTimeTable.$inferInsert;

const deepseek = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_KEY!,
});

const JUROR_NUMEBR = Number(process.env.JUROR_NUMEBR!);
const COURTHOUSE_URL = process.env.COURTHOUSE_URL!;
const COURTHOUSE_HEADING = process.env.COURTHOUSE_HEADING!;
const API_SECRET = process.env.API_SECRET!;

interface JurySiteInfo {
    panelNumbers: string;
    date: string;
    details: string;
}

const formatDate = (day: Date) => day.toISOString().split("T")[0];

const getItem = async (day: Date) => {
    const formattedDate = formatDate(day);
    const result = await db.select().from(juryTimeTable).where(eq(juryTimeTable.day, formattedDate));

    return result[0] ?? undefined;
};

app.use((req, res, next) => {
    const authHeader = req.headers["authorization"];

    const requestLog = `
            [${new Date().toISOString()}] 
            IP: ${req.ip}
            Method: ${req.method}
            Path: ${req.originalUrl}
            Auth Header Present: ${!!authHeader}
            User-Agent: ${req.headers["user-agent"]}
        `;

    if (!authHeader || authHeader !== `Bearer ${API_SECRET}`) {
        console.warn("Unauthorised");
        console.warn(requestLog);

        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    console.log(requestLog);

    next();
});

app.get("/health", async (req, res) => {
    res.status(200).json({ message: "OK" });
});

app.get("/check-duty", async (req, res) => {
    const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(COURTHOUSE_URL, { waitUntil: "networkidle2" });

    const content = await page.content();

    const $ = cheerio.load(content);
    const craigavonSection = $(`h2:contains("${COURTHOUSE_HEADING}")`).next(".x-scroll");

    const summonsInfo: JurySiteInfo[] = [];
    craigavonSection.find("tbody tr").each((_, element) => {
        const panelNumbers = $(element).find("td:nth-child(1)").text().trim();
        const date = $(element).find("td:nth-child(2)").text().trim();
        const details = $(element).find("td:nth-child(3)").text().trim();

        summonsInfo.push({ panelNumbers, date, details });
    });

    const swornJuror = req.query.sworn === "true";

    const deepseekRequest = {
        jurorNumber: JUROR_NUMEBR,
        swornJuror: swornJuror,
        summonsInfo: summonsInfo,
    };

    console.log("Successfully parsed JSON info");

    const response = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(deepseekRequest, null, 2) },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
    });

    const summaryJson = JSON.parse(response.choices[0].message.content!);

    res.status(200).json(summaryJson);
});

app.get("/day/:day", async (req, res) => {
    const day = req.params.day;

    const record = await db.select().from(juryTimeTable).where(eq(juryTimeTable.day, day));

    record.length > 0 ? res.status(200).json(record[0]) : res.status(404).json({ error: "Not found" });
});

app.get("/attendance-summary", async (req, res) => {
    const records = await db.select().from(juryTimeTable);
    res.status(200).json(records);
});

app.post("/depart", async (req, res) => {
    await db.delete(juryTimeTable);
    const currDate = new Date();

    const currRecord = await getItem(currDate);

    if (currRecord) {
        res.status(200).json({ message: "Departure date already saved for today" });
    }

    const record: JuryTimeTable = {
        day: formatDate(currDate),
        leaveTime: currDate,
    };

    await db.insert(juryTimeTable).values(record);
    res.status(201).json(record);
});

app.post("/arrive-home", async (req, res) => {
    const currDate = new Date();
    const currRecord = await getItem(currDate);

    const dayKey = formatDate(currDate);

    if (!currRecord) {
        await db.insert(juryTimeTable).values({ day: dayKey, arriveHomeTime: currDate });
        res.status(201).json({ message: "No depature date selected for today" });
    }

    await db.update(juryTimeTable).set({ arriveHomeTime: currDate }).where(eq(juryTimeTable.day, dayKey));

    res.status(200).json({ message: "Time logged" });
});

app.listen(PORT, function (err) {
    if (err) console.log("Error in server setup");
    console.log("Server listening on Port", PORT);
});
