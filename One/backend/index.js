import { config } from "dotenv";
config();
import express from "express";
import jokesData from "./data.json" assert { type: "json" };

const app = express();
const PORT = process.env.PORT || 8000;

app.get("/", (req, res) => res.send("Home"));

app.get("/api/jokes", (req, res) => res.status(200).json(jokesData));

app.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
});
