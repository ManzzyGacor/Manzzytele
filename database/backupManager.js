const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const { execSync } = require("child_process");

class BackupManager {
  constructor(bot, adminId, backupFile) {
    this.bot = bot;
    this.adminId = adminId;
    this.backupFile = backupFile;
    this.backupCount = 0;

    // =============================
    // ⏳ DELAY BACKUP DI ATUR DI SINI
    // =============================
    const INTERVAL_HOURS = 1; // Ganti sesukamu
    this.intervalMs = INTERVAL_HOURS * 60 * 60 * 1000;
// interval disimpan dalam menit di file
this.intervalMinutes = INTERVAL_HOURS * 60;

  }

getLastBackupTime() {
  try {
    if (!fs.existsSync(this.backupFile)) return null;
    const data = JSON.parse(fs.readFileSync(this.backupFile, "utf8"));
    
    // load counter + interval
    this.backupCount = data.backup_count || 0;
    this.intervalMinutes = data.interval_minutes || (this.intervalMs / 60000);

    return data.last_backup
      ? moment.tz(data.last_backup, "DD-MM-YYYY HH:mm:ss", "Asia/Jakarta").valueOf()
      : null;
  } catch {
    return null;
  }
}

  saveBackupInfo(lastTime, nextTime) {
  try {
    const data = {
      last_backup: moment(lastTime).tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm:ss"),
      next_backup: moment(nextTime).tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm:ss"),
      backup_count: this.backupCount,
      interval_minutes: this.intervalMinutes
    };

    fs.writeFileSync(this.backupFile, JSON.stringify(data, null, 2), "utf8");
    console.log("💾 [SAVE] Data backup tersimpan sesuai format baru!");
  } catch (err) {
    console.error("❌ [ERROR] Gagal menyimpan backup file:", err.message);
  }
}

  async kirimBackupOtomatis() {
    const { bot, adminId, intervalMs } = this;
    const waktuMoment = moment().tz("Asia/Jakarta");

    const frames = [
      "🚀 Menyusun file misterius...",
      "🗂️ Memeriksa setiap folder dan script...",
      "💾 Mengubah file menjadi ZIP ajaib...",
      "✨ Hampir selesai... teleport ke Telegram..."
    ];

    let i = 0;
    const msgAnim = await bot.sendMessage(adminId, frames[i]);
    const animInterval = setInterval(() => {
      i = (i + 1) % frames.length;
      bot.editMessageText(frames[i], {
        chat_id: adminId,
        message_id: msgAnim.message_id,
      });
    }, 900);

    try {
      console.log("\n🧩==============================🧩");
      console.log("🔰  MULAI PROSES BACKUP OTOMATIS");
      console.log(`📅  ${waktuMoment.format("DD-MM-YYYY HH:mm:ss")}`);
      console.log("🧩==============================🧩\n");

      const rootFiles = [
        "index.js", "config.js", "package.json",
        "sessioncs.json", "users.json"
      ];
      const foldersToBackup = [
        "database", "ALL TUTOR"
      ];

      const foundFiles = rootFiles.filter(f => fs.existsSync(f));
      const foundFolders = foldersToBackup.filter(f => fs.existsSync(f));

      if (foundFiles.length === 0 && foundFolders.length === 0)
        throw new Error("🚫 Tidak ada file/folder valid untuk di-backup.");

      console.log(`📂 File ditemukan   : ${foundFiles.join(", ") || "-"}`);
      console.log(`📁 Folder ditemukan : ${foundFolders.join(", ") || "-"}`);

      const formattedTime = waktuMoment.format("DD-MM-YYYY-HH.mm.ss");
      const zipName = `BACKUP-${formattedTime}.zip`;
      const zipFullPath = path.join(process.cwd(), zipName);
      const itemsToZip = [...foundFiles, ...foundFolders].join(" ");

      console.log(`⚙️ Membuat ZIP: ${zipName}`);

      // ⛔ suppress log ZIP biar gak spam
      execSync(`cd "${process.cwd()}" && zip -rq "${zipName}" ${itemsToZip}`, {
        stdio: "ignore",
        shell: "/bin/bash",
      });

      if (!fs.existsSync(zipFullPath))
        throw new Error("❌ File ZIP hasil backup tidak ditemukan.");

      clearInterval(animInterval);
      await bot.editMessageText("✅ File berhasil dikompres!\n🚀 Mengirim ke Telegram…", {
        chat_id: adminId,
        message_id: msgAnim.message_id,
      });

      const stats = fs.statSync(zipFullPath);
      const fileSize =
        stats.size > 1024 * 1024
          ? (stats.size / (1024 * 1024)).toFixed(2) + " MB"
          : (stats.size / 1024).toFixed(2) + " KB";

      const waktuIndo = waktuMoment.format("DD-MM-YYYY | HH.mm.ss");
      const botInfo = await bot.getMe();
      const botUsername = botInfo.username
  ? `@${botInfo.username.replace(/_/g, "\\_")}`
  : "TanpaUsername";

      const captionText = 
      `📦 *Auto Backup Harian*\n\n📅 *Tanggal:* ${waktuIndo}\n📁 *File:* ${zipName}\n📊 *Ukuran:* ${fileSize}\n🤖 *Bot:* ${botUsername}\n\n✅ *Backup otomatis berhasil!*`;

      console.log("📤 Mengirim ZIP ke Telegram... 📩");
      await bot.sendDocument(adminId, fs.createReadStream(zipFullPath), {
        caption: captionText,
        parse_mode: "Markdown",
      });

const backupTime = Date.now();
this.backupCount++;

const nextTime = backupTime + intervalMs;

const nextFormatted = moment(nextTime)
  .tz("Asia/Jakarta")
  .format("DD-MM-YYYY HH:mm:ss");

this.saveBackupInfo(backupTime, nextTime);

      console.log("\n🧹 Membersihkan file backup lama...");
      for (const file of fs.readdirSync(process.cwd())) {
        if (file.startsWith("BACKUP-") && file.endsWith(".zip") && file !== zipName) {
          try {
            fs.unlinkSync(path.join(process.cwd(), file));
            console.log(`🗑️ Dihapus: ${file}`);
          } catch {
            console.warn(`⚠️ Gagal hapus: ${file}`);
          }
        }
      }

      fs.unlinkSync(zipFullPath);

      console.log("\n⏭️ Jadwal backup berikut:", nextFormatted);
      console.log("✅ Backup dikirim ke Admin ID:", adminId);
      console.log("🧩==============================🧩\n");

await bot.sendMessage(
  adminId,
  `⏳ Backup otomatis selanjutnya dijadwalkan pada: ${nextFormatted}`
);
      await bot.deleteMessage(adminId, msgAnim.message_id);

    } catch (err) {
      clearInterval(animInterval);
      console.error("❌ [ERROR BACKUP]:", err.message);
// Fix: kirim pesan ERROR tanpa Markdown agar aman
const safeError = (err.stack || err.message || "Unknown error")
  .toString()
  .slice(0, 3800); // aman dari limit Telegram

await bot.editMessageText(
  `⚠️ Backup otomatis gagal!\n\nError detail:\n${safeError}`,
  {
    chat_id: adminId,
    message_id: msgAnim.message_id,
    parse_mode: undefined, // TANPA PARSE MODE! Anti error.
  }
);
    }
  }

  startAutoBackup() {
    const { intervalMs } = this;
    const lastBackup = this.getLastBackupTime();
    const now = Date.now();
    let firstDelay = lastBackup ? Math.max(0, intervalMs - (now - lastBackup)) : 0;

    setTimeout(() => {
      this.kirimBackupOtomatis();
      setInterval(() => this.kirimBackupOtomatis(), intervalMs);
    }, firstDelay);

    const next = new Date(now + firstDelay).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    console.log("🔁 Bot di-restart, jadwal backup berikut:", next);

    this.bot.sendMessage(
      this.adminId,
      `🔄 Bot baru di-restart!\n⏳ Backup otomatis selanjutnya dijadwalkan pada: ${next}`
    );
  }
}

module.exports = BackupManager;