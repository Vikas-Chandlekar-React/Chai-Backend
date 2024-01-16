import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { Subscription } from "../models/subscription.model.js";
import {
  destroyImageFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";
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

const changeCurrentPassword = asyncHandler(async (req, res) => {
  /** DESC : Step to change password
   *  1. Take old and new password from user
   *  2. If we hit this API means user already login so they have req.user from auth.middleware
   *  3. find User in db by using _id
   *  4. check isPasswordCorrect method pass old password
   *  5. If password match, then save new password in db using save()
   */
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(401, "Invalid Old Password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  // DESC : Here, both fullName and email is required to update the data

  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, "All fields are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account Details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  // DESC : delete old avatar image from cloudinary
  // https://chat.openai.com/share/a13b66d8-a1fe-4848-b6c0-7dd8782c7812

  const oldAvatarUrl = req.user?.avatar;
  // console.log(`🚀 ~ updateUserAvatar ~ oldAvatarUrl:`, oldAvatarUrl)

  destroyImageFromCloudinary(oldAvatarUrl);

  // throw new Error("Sachin..............................")

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  // DESC : delete old cover image from cloudinary
  const oldCoverImageUrl = req.user?.coverImage;
  // console.log(`🚀 ~ updateUserAvatar ~ oldCoverImageUrl:`, oldCoverImageUrl)

  destroyImageFromCloudinary(oldCoverImageUrl);

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading on avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

const subscribedButtonClick = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const subscribedUserId = req.user?._id;
  console.log("##############################");

  console.log(req.user._id);

  console.table({ channelId, subscribedUserId });

  const schemaObj = await Subscription.create({
    subscriber: subscribedUserId,
    channel: channelId,
  });

  console.log("schemaObj = ", schemaObj);

  return res
    .status(201)
    .json(
      new ApiResponse(201, schemaObj, "Subscribed Button Clicked Successfully")
    );
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "Username is missing");
  }

  const channel = await User.aggregate([
    {
      // DESC : strict search even if username is lowercase : true in user schema
      $match: {
        username,
      },
    },

    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },

    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },

    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },
        // POINT : 1st way
        // isSubscribed: {
        //   $cond: {
        //     if: {
        //       $in: [req.user?._id, "$subscribers.subscriber"],
        //     },
        //     then: true,
        //     else: false,
        //   },
        // },

        // POINT : 2nd way
        isSubscribed: {
          $in: [req.user?._id, "$subscribers.subscriber"],
        },
      },
    },

    {
      $project: {
        fullName: 1,
        username: 1,
        email: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
      },
    },
  ]);

  // console.log("Aggregate Result ::: ", channel);

  if (!channel?.length) {
    throw new ApiError(404, "Channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  subscribedButtonClick,
  getUserChannelProfile,
};
