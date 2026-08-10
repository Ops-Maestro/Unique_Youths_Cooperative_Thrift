import mongoose from "mongoose";
const schema=new mongoose.Schema({
  email:{type:String,required:true,unique:true,lowercase:true},
  username:{type:String,required:true,unique:true,lowercase:true},
  password:{type:String,required:true},
  role:{type:String,enum:["master_supervisor","staff_auditor"],required:true},
  isActive:{type:Boolean,default:true}
},{timestamps:true});
export default mongoose.model("Admin",schema);
