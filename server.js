require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
// Middleware
app.use(cors());
app.use(express.json());
// Kết nối MongoDB với username là MSSV, password là MSSV, dbname là it4409
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB Error:", err));
// TODO: Tạo Schema
const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Tên không được để trống"],
    minlength: [2, "Tên phải có ít nhất 2 ký tự"],
    trim: true,
  },
  age: {
    type: Number,
    required: [true, "Tuổi không được để trống"],
    min: [0, "Tuổi phải >= 0"],
  },
  email: {
    type: String,
    required: [true, "Email không được để trống"],
    match: [/^\S+@\S+\.\S+$/, "Email không hợp lệ"],
    unique: true,
    trim: true,
    lowercase: true,
  },
  address: {
    type: String,
    trim: true,
  },
});
const User = mongoose.model("User", UserSchema);
// Helper function: Validate và chuẩn hóa page/limit
const validatePagination = (page, limit) => {
  // Giới hạn page >= 1
  const validPage = Math.max(1, parseInt(page) || 1);
  // Giới hạn limit từ 1 đến 100
  const validLimit = Math.min(100, Math.max(1, parseInt(limit) || 5));
  return { validPage, validLimit };
};

// Helper function: Chuẩn hóa dữ liệu đầu vào
const normalizeUserData = (data) => {
  const normalized = {};
  if (data.name !== undefined) {
    normalized.name = String(data.name).trim();
  }
  if (data.age !== undefined) {
    // Đảm bảo tuổi là số nguyên
    normalized.age = Math.floor(Number(data.age));
  }
  if (data.email !== undefined) {
    normalized.email = String(data.email).trim().toLowerCase();
  }
  if (data.address !== undefined) {
    normalized.address = String(data.address).trim();
  }
  return normalized;
};

// TODO: Implement API endpoints
app.get("/api/users", async (req, res) => {
  try {
    // Validate và giới hạn page/limit
    const { validPage, validLimit } = validatePagination(
      req.query.page,
      req.query.limit
    );
    const search = (req.query.search || "").trim();
    
    // Tạo query filter cho search
    const filter = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { address: { $regex: search, $options: "i" } },
          ],
        }
      : {};
    
    // Tính skip
    const skip = (validPage - 1) * validLimit;
    
    // Sử dụng Promise.all cho truy vấn song song
    const [users, total] = await Promise.all([
      User.find(filter).skip(skip).limit(validLimit),
      User.countDocuments(filter),
    ]);
    
    const totalPages = Math.ceil(total / validLimit);
    
    // Trả về response
    res.json({
      page: validPage,
      limit: validLimit,
      total,
      totalPages,
      data: users,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/users", async (req, res) => {
  try {
    // Chuẩn hóa dữ liệu đầu vào
    const normalizedData = normalizeUserData(req.body);
    
    // Kiểm tra email duy nhất
    if (normalizedData.email) {
      const existingUser = await User.findOne({ email: normalizedData.email });
      if (existingUser) {
        return res.status(400).json({ error: "Email đã tồn tại" });
      }
    }

    // Tạo user mới
    const newUser = await User.create(normalizedData);
    res.status(201).json({
      message: "Tạo người dùng thành công",
      data: newUser,
    });
  } catch (err) {
    // Xử lý lỗi duplicate email từ MongoDB
    if (err.code === 11000) {
      return res.status(400).json({ error: "Email đã tồn tại" });
    }
    res.status(400).json({ error: err.message });
  }
});
app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Kiểm tra ID hợp lệ
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID không hợp lệ" });
    }
    
    // Chuẩn hóa dữ liệu đầu vào và chỉ lấy các trường có giá trị
    const normalizedData = normalizeUserData(req.body);
    
    // Loại bỏ các trường undefined/null/empty string
    const updateData = {};
    if (normalizedData.name !== undefined && normalizedData.name !== "") {
      updateData.name = normalizedData.name;
    }
    if (normalizedData.age !== undefined && !isNaN(normalizedData.age)) {
      updateData.age = normalizedData.age;
    }
    if (normalizedData.email !== undefined && normalizedData.email !== "") {
      // Kiểm tra email duy nhất (trừ user hiện tại)
      const existingUser = await User.findOne({ 
        email: normalizedData.email,
        _id: { $ne: id }
      });
      if (existingUser) {
        return res.status(400).json({ error: "Email đã tồn tại" });
      }
      updateData.email = normalizedData.email;
    }
    if (normalizedData.address !== undefined) {
      updateData.address = normalizedData.address;
    }
    
    // Chỉ cập nhật nếu có ít nhất một trường
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "Không có dữ liệu để cập nhật" });
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }
    
    res.json({
      message: "Cập nhật người dùng thành công",
      data: updatedUser,
    });
  } catch (err) {
    // Xử lý lỗi duplicate email từ MongoDB
    if (err.code === 11000) {
      return res.status(400).json({ error: "Email đã tồn tại" });
    }
    res.status(400).json({ error: err.message });
  }
});
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Kiểm tra ID hợp lệ trước khi xóa
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID không hợp lệ" });
    }
    
    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }
    res.json({ message: "Xóa người dùng thành công" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
