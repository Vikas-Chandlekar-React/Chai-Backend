import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    /** DESC :
     *  Access token come from either browser or mobile
     *  - for browser = cookie
     *  - for mobile = header
     *  */
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Basic ", "");

    console.log("Auth middleware ::: token ::: ", token);

    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    // console.log(`🚀 ~ verifyJWT ~ decodedToken:`, decodedToken)

    const user = await User.findById(decodedToken?.id).select(
      "-password -refreshToken"
    );

    if (!user) {
      throw new ApiError(401, "Invalid Access Token");
    }

    req.user = user;
    
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});
