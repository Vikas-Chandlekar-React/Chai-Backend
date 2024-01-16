import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { ApiError } from "./ApiError.js";
import { extractPublicId } from "cloudinary-build-url";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    // DESC : Upload the file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
      folder: "chai-backend", // optional
    });

    // file has been successfully uploaded.
    console.log("File is uploaded successfully (response) : ", response);

    // DESC : After successfully upload file on cloudinary then we want to remove file from local server in sync
    fs.unlinkSync(localFilePath);

    return response;
  } catch (error) {
    // DESC : Remove the locally saved temporary file as the upload operation got failed
    fs.unlinkSync(localFilePath);
  }
};

const destroyImageFromCloudinary = async (cloudinaryImageURL) => {
  try {
    const publicId = extractPublicId(cloudinaryImageURL);
    // console.log(`🚀 ~ destroyImageFromCloudinary ~ publicId:`, publicId);

    const res = await cloudinary.uploader.destroy(publicId);
    // console.log("res = ", res);
    if (res.result === "not found")
      throw new ApiError(404, "Cloudinary Avatar Image URL doesn't exists");
  } catch (error) {
    throw new ApiError(500, "Internal Server Error");
  }
};

export { uploadOnCloudinary, destroyImageFromCloudinary };
