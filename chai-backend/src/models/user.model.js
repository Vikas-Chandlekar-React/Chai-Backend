import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // LEARN : Used when we want to search on that field. It is optimize for searching
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    avatar: {
      type: String, // cloudinary url
      required: true,
    },
    coverImage: {
      type: String, // cloudinary url
    },
    watchedHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    refreshToken: {
      type: String,
    },
  },
  { timestamps: true }
);

/** LEARN : Pre-Hook for hashing password using bcrypt (It is middleware) */
// IMP : Always used normal function because we want to access this
userSchema.pre("save", async function (next) {
  // DESC : If password is not modified the return immediately
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// LEARN : Create custom method
userSchema.methods.isPasswordCorrect = async function (password) {
  /** DESC :
   *  - It return true/false
   *  - 1st arg : user input (string)
   *  - 2nd arg : encrypted password (stored in collection)
   */
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  /** DESC : Generate Access Token (short duration)
   *  - 1st arg : payload,
   *  - 2nd arg : secret key,
   *  - 3rd arg : expiry time
   */
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      username: this.username,
      fullName: this.fullName,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

userSchema.methods.generateRefreshToken = function () {
  /** DESC : Generate Refresh Token (long duration)
   *  - 1st arg : payload,
   *  - 2nd arg : secret key,
   *  - 3rd arg : expiry time
   */
  return jwt.sign(
    {
      id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

export const User = new mongoose.model("User", userSchema);
