import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;

    // LEARN : It turn off validation rule because we want to save only few fields and does not run validation rule
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  /** DESC : Step for register
   *  1. get user details from frontend
   *  2. validation - not empty, email
   *  3. check if user already exists using username, email
   *  4. check for images, check for avatar
   *  5. upload them in cloudinary, avatar
   *  6. create user object - create entry in db
   *  7. remove password and refresh token field from response
   *  8. check for user creation
   *  9. return response
   */

  const { fullName, email, username, password } = req.body;

  console.table({ fullName, email, username, password });

  // LEARN : Throw error when any one of field is empty string, null or undefined
  if (
    ![fullName, email, username, password].every(
      (field) => field && field.trim() !== ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  console.log(`🚀 ~ registerUser ~ existedUser:`, existedUser);

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  console.log("register controllers :: files ::: ", req.files);

  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

  console.table({ avatarLocalPath, coverImageLocalPath });

  // DESC : throw error when we don't pass avatar file because it is required
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  // console.log(`avatar cloudinary response ::: `, avatar);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  // LEARN : For registration create() is used.
  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username,
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User Registered Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  /** DESC : Step for login
   *  1. get data from frontend in req.body
   *  2. login using username or email (both way)
   *  3. find the user in db
   *  4. password check
   *  5. generate access token and refresh token
   *  6. send data as cookie
   */

  const { username, email, password } = req.body;
  // console.log(`🚀 ~ loginUser ~ username:`, username);

  // DESC : Throw error when either username and email are not present. We must include either username or email to work properly
  // POINT : 1st way
  // if (!username && !email) {
  //   throw new ApiError(400, "Username or Email is required");
  // }

  // POINT : 2nd way
  if (!(username || email)) {
    throw new ApiError(400, "Username or Email is required");
  }

  // PROBLEM :: (2) : strict search not happening for username and email, because both have lowercase : true in userSchema
  // const user = await User.findOne({
  //   $or: [{ username }, { email }],
  // });

  // SOLUTION :: (2) : strict search work properly for username and email when both is lowercase : true in userSchema
  const user = await User.findOne({
    $or: [
      { username: { $regex: new RegExp(`^${username}$`) } },
      { email: { $regex: new RegExp(`^${email}$`) } },
    ],
  });

  // console.log(`🚀 ~ loginUser ~ user:`, user);

  if (!user) {
    throw new ApiError(404, "User does not exists");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // LEARN : Sending secure cookie (we can't modified at frontend)
  const options = {
    httpOnly: true,
    secure: true,
  };

  // LEARN : Send multiple cookies
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User Logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  try {
    /** PROBLEM :: (1) :
     *  Here, We are not passing _id of user, so how to find the particular user who want to logout.
     *  If we accepting _id so anyone can logout the user.
     */

    //  SOLUTION :: (1) : Create auth middleware

    /** DESC :
     * Step for logout
     *  1. get _id from req.user which is passed by auth middleware
     *  2. set refreshToken to undefined or unset refreshToken (it will remove the refresh token field form document)
     *  3. clear cookie from frontend side
     */

    await User.findByIdAndUpdate(
      req.user._id,
      {
        $unset: {
          refreshToken: 1, // this removes the field from document
        },
      },
      { new: true }
    );

    const options = {
      httpOnly: true,
      secure: true,
    };

    return res
      .status(200)
      .clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .json(new ApiResponse(200, {}, "User Logged Out Successfully"));
  } catch (error) {}
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  /** DESC : Step for refresh access token
   *  1. get refreshToken from client
   *    1.1. browser = cookies
   *    1.2. mobile = body
   *  2. Decode incomingRefreshToken using REFRESH_TOKEN_SECRET
   *  3. Find user using id provided in decodedToken
   *  4. Check incomingRefreshToken and db saved refreshToken same or not
   *  5. If same, generate both new accessToken and refreshToken using generateAccessAndRefreshTokens()
   *  6. Again, set secure cookies for both accessToken and refreshToken in browser & for mobile send json
   */

  try {
    const incomingRefreshToken =
      req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
      throw new ApiError(401, "Unauthorized request");
    }

    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?.id);

    if (!user) {
      throw new ApiError(401, "Invalid Refresh Token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      // console.log("Refresh token not matched with db ❌");
      throw new ApiError(401, "Refresh token is expired or used");
    }

    // console.log("Refresh token matched with db ✅");

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    console.log(`🚀 ~ refreshAccessToken ~ newRefreshToken:`, newRefreshToken);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

export { registerUser, loginUser, logoutUser, refreshAccessToken };
