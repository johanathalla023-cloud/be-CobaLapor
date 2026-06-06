import db from "../config/database.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "../uploads");


export const createLaporan = async (req, user, files) => {
  const logFile = path.join(uploadsDir, "../debug_laporan_create.log");
  try {
    let title = req.body.title;
    let description = req.body.description;
    let tanggal_kejadian = req.body.tanggal_kejadian;
    let lokasi_kejadian = req.body.lokasi_kejadian;
    let instansi_tujuan = req.body.instansi_tujuan;
    let category_id = req.body.category_id;
    
    fs.appendFileSync(logFile, `\n\n--- [${new Date().toISOString()}] createLaporan Executing ---\n`);
    fs.appendFileSync(logFile, `User: ${JSON.stringify(user, null, 2)}\n`);
    fs.appendFileSync(logFile, `Fields: ${JSON.stringify({title, description, tanggal_kejadian, lokasi_kejadian, instansi_tujuan, category_id}, null, 2)}\n`);
    
    if (!title || !description) {
      if (files && files.length > 0) {
        files.forEach(file => {
          if (file.path) fs.unlinkSync(file.path);
        });
      }
      fs.appendFileSync(logFile, `Result: Validation Error (Missing title/description)\n`);
      return { error: "Title dan description wajib diisi ❌" };
    }

    const imagePaths = [];
    if (files && files.length > 0) {
      files.forEach(file => {
        if (file.filename) {
          imagePaths.push(`/uploads/${file.filename}`);
        }
      });
    }

    const primaryImage = imagePaths[0] || null;

    const [result] = await db.query(
      `INSERT INTO laporan (user_id, title, description, tanggal_kejadian, lokasi_kejadian, instansi_tujuan, category_id, status, image) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [user.id, title, description, tanggal_kejadian || null, lokasi_kejadian || null, instansi_tujuan || null, category_id || null, primaryImage]
    );

    const successRes = { 
      message: "Laporan berhasil dibuat ✅",
      id: result.insertId,
      image: primaryImage,
      images: imagePaths
    };
    fs.appendFileSync(logFile, `Result: Success! Inserted ID: ${result.insertId}\n`);
    return successRes;
  } catch (error) {
    console.log("Error createLaporan:", error);
    fs.appendFileSync(logFile, `Result: Database Error: ${error.message}\nStack: ${error.stack}\n`);
    if (files && files.length > 0) {
      files.forEach(file => {
        if (file.path) fs.unlinkSync(file.path);
      });
    }
    return { error: error.message };
  }
};

export const updateLaporan = async (id, user, reqBody, files) => {
  try {
    const { title, description, category_id } = reqBody;
    let existing_images = reqBody.existing_images;
    const userId = Number(user.id);
    const laporanId = Number(id);
    
    const [check] = await db.query(
      "SELECT * FROM laporan WHERE id = ? AND user_id = ?",
      [laporanId, userId]
    );
    
    if (check.length === 0) {
      if (files && files.length > 0) {
        files.forEach(file => { if (file.path) fs.unlinkSync(file.path); });
      }
      return { message: "Laporan tidak ditemukan / bukan milik user ❌" };
    }
    
    let oldImages = [];
    if (check[0].images) {
      try {
        oldImages = JSON.parse(check[0].images);
      } catch (e) {}
    } else if (check[0].image) {
      oldImages = [check[0].image];
    }
    
    let imagesToKeep = [];
    if (existing_images) {
      try {
        imagesToKeep = typeof existing_images === "string" ? JSON.parse(existing_images) : existing_images;
      } catch (e) {
        imagesToKeep = typeof existing_images === "string" ? [existing_images] : [];
      }
    }
    
    for (const oldImg of oldImages) {
      if (!imagesToKeep.includes(oldImg)) {
        const oldImagePath = path.join(uploadsDir, path.basename(oldImg));
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    }
    
    const newImagePaths = [];
    if (files && files.length > 0) {
      files.forEach(file => {
        if (file.filename) {
          newImagePaths.push(`/uploads/${file.filename}`);
        }
      });
    }
    
    const finalImages = [...imagesToKeep, ...newImagePaths];
    const primaryImage = finalImages[0] || null;
    const imagesJson = finalImages.length > 0 ? JSON.stringify(finalImages) : null;
    
    let updateFields = [];
    let updateValues = [];
    
    if (title) {
      updateFields.push("title = ?");
      updateValues.push(title);
    }
    if (description) {
      updateFields.push("description = ?");
      updateValues.push(description);
    }
    if (reqBody.instansi_tujuan !== undefined) {
      updateFields.push("instansi_tujuan = ?");
      updateValues.push(reqBody.instansi_tujuan || null);
    }
    if (category_id) {
      updateFields.push("category_id = ?");
      updateValues.push(category_id);
    }
    
    updateFields.push("image = ?");
    updateValues.push(primaryImage);
    updateFields.push("images = ?");
    updateValues.push(imagesJson);
    
    if (updateFields.length === 0) {
      if (files && files.length > 0) {
        files.forEach(file => { if (file.path) fs.unlinkSync(file.path); });
      }
      return { message: "Tidak ada data yang diupdate ⚠️" };
    }
    
    updateValues.push(laporanId, userId);
    
    await db.query(
      `UPDATE laporan SET ${updateFields.join(", ")} WHERE id = ? AND user_id = ?`,
      updateValues
    );
    
    return { 
      message: "Laporan berhasil diupdate ✅",
      image: primaryImage,
      images: finalImages
    };
  } catch (error) {
    if (files && files.length > 0) {
      files.forEach(file => { if (file.path) fs.unlinkSync(file.path); });
    }
    return { error: error.message };
  }
};

export const deleteLaporan = async (id, user) => {
  try {
    const userId = Number(user.id);
    const laporanId = Number(id);
    const role = user.role;

    let checkQuery = "SELECT image, images FROM laporan WHERE id = ?";
    let checkParams = [laporanId];
    if (role !== 'admin' && role !== 'super_admin') {
      checkQuery += " AND user_id = ?";
      checkParams.push(userId);
    }
    
    const [laporan] = await db.query(checkQuery, checkParams);
    if (laporan.length === 0) {
      return { message: "Data tidak ditemukan / bukan milik user ❌" };
    }

    let images = [];
    if (laporan[0].images) {
      try {
        images = JSON.parse(laporan[0].images);
      } catch (e) {}
    } else if (laporan[0].image) {
      images = [laporan[0].image];
    }

    images.forEach(img => {
      if (img) {
        const imagePath = path.join(uploadsDir, path.basename(img));
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
    });

    let deleteQuery, deleteParams;
    if (role === 'admin' || role === 'super_admin') {
      deleteQuery = "DELETE FROM laporan WHERE id = ?";
      deleteParams = [laporanId];
    } else {
      deleteQuery = "DELETE FROM laporan WHERE id = ? AND user_id = ?";
      deleteParams = [laporanId, userId];
    }

    const [result] = await db.query(deleteQuery, deleteParams);

    if (result.affectedRows === 0) {
      return { message: "Data tidak ditemukan / gagal dihapus ❌" };
    }

    return { message: "Laporan berhasil dihapus ✅" };
  } catch (error) {
    return { error: error.message };
  }
};

export const getPublicLaporan = async (req, res) => {
  try {
    const limit = req.query.limit || 5;
    const [rows] = await db.query(
      `SELECT l.*, u.nama_lengkap as username, c.name as category_name 
       FROM laporan l
       JOIN users u ON l.user_id = u.id
       LEFT JOIN categories c ON l.category_id = c.id
       ORDER BY l.created_at DESC
       LIMIT ?`,
      [parseInt(limit)]
    );
    const formattedRows = rows.map(row => {
      let imgs = [];
      if (row.images) {
        try { imgs = JSON.parse(row.images); } catch(e) {}
      } else if (row.image) {
        imgs = [row.image];
      }
      return { ...row, images: imgs };
    });
    res.json(formattedRows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllLaporan = async () => {
  try {
    const [rows] = await db.query(
      `SELECT l.*, u.nama_lengkap as username, c.name as category_name 
       FROM laporan l
       JOIN users u ON l.user_id = u.id
       LEFT JOIN categories c ON l.category_id = c.id
       ORDER BY l.created_at DESC`
    );
    return rows.map(row => {
      let imgs = [];
      if (row.images) {
        try { imgs = JSON.parse(row.images); } catch(e) {}
      } else if (row.image) {
        imgs = [row.image];
      }
      return { ...row, images: imgs };
    });
  } catch (error) {
    return { error: error.message };
  }
};

export const getLaporanById = async (id, user) => {
  try {
    const [rows] = await db.query(
      `SELECT l.*, u.nama_lengkap as username, c.name as category_name 
       FROM laporan l
       JOIN users u ON l.user_id = u.id
       LEFT JOIN categories c ON l.category_id = c.id
       WHERE l.id = ?`,
      [id]
    );
    
    if (rows.length === 0) {
      return { error: "Laporan tidak ditemukan ❌" };
    }
    
    const laporan = rows[0];
    
    // Validasi role
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      if (laporan.user_id !== user.id) {
        return { error: "Akses ditolak - Bukan laporan anda ❌" };
      }
    }
    
    let imgs = [];
    if (laporan.images) {
      try { imgs = JSON.parse(laporan.images); } catch(e) {}
    } else if (laporan.image) {
      imgs = [laporan.image];
    }
    laporan.images = imgs;
    
    const [comments] = await db.query(
      `SELECT c.*, u.nama_lengkap as username 
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.laporan_id = ?
       ORDER BY c.created_at ASC`,
      [id]
    );
    
    laporan.comments = comments;
    
    return laporan;
  } catch (error) {
    return { error: error.message };
  }
};

export const getLaporanByUser = async (user) => {
  try {
    const [rows] = await db.query(
      `SELECT l.*, c.name as category_name 
       FROM laporan l
       LEFT JOIN categories c ON l.category_id = c.id
       WHERE l.user_id = ?
       ORDER BY l.created_at DESC`,
      [user.id]
    );
    return rows.map(row => {
      let imgs = [];
      if (row.images) {
        try { imgs = JSON.parse(row.images); } catch(e) {}
      } else if (row.image) {
        imgs = [row.image];
      }
      return { ...row, images: imgs };
    });
  } catch (error) {
    return { error: error.message };
  }
};

export const updateStatusLaporan = async (id, user, status, rejectionReason = null) => {
  try {
    const role = user.role;
    const laporanId = Number(id);
    
    if (role !== 'admin' && role !== 'super_admin') {
      return { error: "Hanya admin yang bisa update status ❌" };
    }
    
    const validStatus = ['pending', 'approved', 'rejected'];
    if (!validStatus.includes(status)) {
      return { error: "Status tidak valid. Gunakan: pending, approved, rejected ❌" };
    }
    
    // Jika status rejected, alasan penolakan wajib diisi
    if (status === 'rejected' && !rejectionReason) {
      return { error: "Alasan penolakan wajib diisi saat menolak laporan ❌" };
    }
    
    let query = "UPDATE laporan SET status = ?";
    let params = [status, laporanId];
    
    // Tambahkan rejection_reason jika status adalah rejected
    if (status === 'rejected' && rejectionReason) {
      query = "UPDATE laporan SET status = ?, rejection_reason = ? WHERE id = ?";
      params = [status, rejectionReason, laporanId];
    } else {
      query += " WHERE id = ?";
    }
    
    const [result] = await db.query(query, params);
    
    if (result.affectedRows === 0) {
      return { message: "Laporan tidak ditemukan ❌" };
    }
    
    return { message: `Status laporan berhasil diubah menjadi ${status} ✅` };
  } catch (error) {
    return { error: error.message };
  }
};

export const rejectLaporanWithReason = async (id, user, rejectionReason) => {
  try {
    const role = user.role;
    const laporanId = Number(id);
    
    if (role !== 'admin' && role !== 'super_admin') {
      return { error: "Hanya admin yang bisa menolak laporan ❌" };
    }
    
    // Validasi alasan penolakan
    if (!rejectionReason || rejectionReason.trim() === '') {
      return { error: "Alasan penolakan tidak boleh kosong ❌" };
    }
    
    if (rejectionReason.length < 10) {
      return { error: "Alasan penolakan minimal 10 karakter ❌" };
    }
    
    if (rejectionReason.length > 1000) {
      return { error: "Alasan penolakan maksimal 1000 karakter ❌" };
    }
    
    // Check apakah laporan exist
    const [checkLaporan] = await db.query(
      "SELECT id, status FROM laporan WHERE id = ?",
      [laporanId]
    );
    
    if (checkLaporan.length === 0) {
      return { error: "Laporan tidak ditemukan ❌" };
    }
    
    // Update status menjadi rejected dan simpan alasan
    const [result] = await db.query(
      "UPDATE laporan SET status = ?, rejection_reason = ? WHERE id = ?",
      ['rejected', rejectionReason, laporanId]
    );
    
    if (result.affectedRows === 0) {
      return { error: "Gagal menolak laporan ❌" };
    }
    
    return { 
      message: "Laporan berhasil ditolak dengan alasan ✅",
      id: laporanId,
      status: "rejected",
      rejection_reason: rejectionReason
    };
  } catch (error) {
    return { error: error.message };
  }
};