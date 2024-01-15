import mongoose, { Schema } from "mongoose";

/**
 * Subscription Schema represents the relationship between a subscriber and the channel they are subscribing to.
 * It captures the subscriber (user who is subscribing) and the channel (user to whom the subscriber is subscribing).
 */

const subscriptionSchema = new Schema(
  {
    subscriber: {
      type: Schema.Types.ObjectId, // one who is subscribing
      ref: "User",
    },
    channel: {
      type: Schema.Types.ObjectId, // one to whom 'subscriber' is subscribing
      ref: "User",
    },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model("Subscription", subscriptionSchema);
