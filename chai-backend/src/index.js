// require("dotenv").config({ path: "./.env" });
import dotenv from "dotenv";
dotenv.config({
  path: "./.env",
});

import mongoose from "mongoose";
import { DB_NAME } from "./constants.js";
import connectDB from "./db/index.js";

const PORT = process.env.PORT || 8000;

// POINT : 2ND WAY to connect MONGODB (BEST WAY)
connectDB();

























// // POINT : 1st way to connect MONGODB (BAD WAY)
// import express from "express";
// const app = express();
// (async () => {
//   try {
//     await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);

//     app.on("error", (error) => {
//       console.log("Error : ", error);
//       throw error;
//     });

//     app.listen(PORT, () => {
//       console.log(`Server is running on port http://localhost:${PORT}`);
//     });
//   } catch (error) {
//     console.log("ERROR : ", error);
//   }
// })();
