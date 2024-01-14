import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

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

export { registerUser };
