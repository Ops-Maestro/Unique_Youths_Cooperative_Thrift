import mongoose from "mongoose";
const schema=new mongoose.Schema({
  user:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  circle:{type:mongoose.Schema.Types.ObjectId,ref:"Circle",required:true},
  monthIndex:{type:Number,required:true,min:1},
  savingsAmount:{type:Number,default:10000},
  partyAmount:{type:Number,default:1000},
  latePenalty:{type:Number,default:0,immutable:true},
  isPaid:{type:Boolean,default:false},
  // Who confirmed this payment happened - money always moves off-platform
  // (bank transfer / cash to the admin, proof shared in the WhatsApp
  // community), so an admin is always the one who marks a ledger entry paid.
  confirmedBy:{type:mongoose.Schema.Types.ObjectId,ref:"Admin"},
  paymentReference:String,
  paidAt:Date
},{timestamps:true});
schema.index({user:1,circle:1,monthIndex:1},{unique:true});
export default mongoose.model("Ledger",schema);
