import mongoose from "mongoose";
const schema=new mongoose.Schema({
  type:{type:String,enum:["payment_received","payment_missed","general_update"],required:true},
  description:{type:String,required:true},
  circle:{type:mongoose.Schema.Types.ObjectId,ref:"Circle",default:null},
  // When set, this announcement is private - only this one member sees it
  // (e.g. their personal welcome message). When null, it's a broadcast:
  // visible to every member, or to just one circle if `circle` is also set.
  user:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"Admin"},
  // System-generated notices (welcome, welcome-back, join announcements,
  // profile reminders) set this so Mongo's TTL monitor auto-deletes them
  // after a short window. Admin broadcasts from the Broadcast Engine never
  // set this, so they persist until an admin deletes them manually.
  expiresAt:{type:Date,default:null}
},{timestamps:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export default mongoose.model("Announcement",schema);
