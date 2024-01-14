import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

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

export { uploadOnCloudinary };
