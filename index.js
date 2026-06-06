import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js";
import laporanRoutes from "./routes/laporanRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*', // Allow semua origin (mobile, web, dev)
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
  ],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: false,
}));




// 1. Static files (tidak perlu stream parsing)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 2.  Laporan routes DULUAN — multer akan handle multipart parsing sendiri
app.use("/api/laporan", laporanRoutes);

// 3. Setelah laporan, baru pasang body parsers untuk routes lain
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Routes lainnya (tidak ada multer, aman pakai JSON/urlencoded)
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/categories", categoryRoutes);


// 5. Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: err.message || "Terjadi kesalahan server" });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});