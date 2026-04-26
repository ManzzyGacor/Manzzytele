process.on("unhandledRejection", (reason) => console.log("[ANTI CRASH] Unhandled Rejection:", reason));
process.on("uncaughtException", (err) => console.log("[ANTI CRASH] Uncaught Exception:", err));
process.on("uncaughtExceptionMonitor", (err) => console.log("[ANTI CRASH MONITOR]:", err));

const config = require("./config.js");
const TelegramBot = require("node-telegram-bot-api");
const moment = require('moment-timezone');
const { Client } = require('ssh2');
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { exec } = require('child_process');
const FormData = require('form-data');
const fetch = require('node-fetch');
const axios = require('axios');
const figlet = require("figlet");
const crypto = require("crypto");
const fs = require("fs");
const chalk = require("chalk");
const P = require("pino");
const path = require("path");
const archiver = require("archiver");
const { execSync } = require('child_process'); 
const { computeCheck } = require("telegram/Password");
const { InlineKeyboardButton } = require('telegraf');
let subdomainSelectionContext = {}; // { userId: { host, ip, created, msgId } }
const { cloudflareDomains } = require("./config.js");
const qs = require('qs');
const QRCode = require('qrcode');
const bot = new TelegramBot(config.TOKEN, { polling: true });
const owner = config.OWNER_ID.toString();
const urladmin = config.urladmin;
const urlchannel = config.urlchannel;
const channellog = config.idchannel;
console.log("✅ Bot Manzzy ID berjalan tanpa error!");

// ====================================================
// 🧱 FILE DATABASE
// ====================================================
// ================== IMPORT MODULE ==================
const BackupManager = require("./database/backupManager.js");

const backupFile = "./database/lastBackup.json";
const backupManager = new BackupManager(bot, owner, backupFile);

backupManager.startAutoBackup();

const blacklistFile = path.join(__dirname, "./database/blacklist.json");
if (!fs.existsSync(blacklistFile)) fs.writeFileSync(blacklistFile, JSON.stringify([], null, 2));

const maintenanceFile = path.join(__dirname, "./database/maintenance.json");
if (!fs.existsSync(maintenanceFile)) fs.writeFileSync(maintenanceFile, JSON.stringify({ status: false }));

const groupOnlyFile = path.join(__dirname, "./database/grouponly.json");
if (!fs.existsSync(groupOnlyFile)) fs.writeFileSync(groupOnlyFile, JSON.stringify({ status: false }));

const modeFile = path.join(__dirname, "./database/mode.json");
if (!fs.existsSync(modeFile)) fs.writeFileSync(modeFile, JSON.stringify({ self: false }));

const joinChFile = path.join(__dirname, "./database/joinchannel.json");
if (!fs.existsSync(joinChFile)) {
  fs.writeFileSync(joinChFile, JSON.stringify({ status: false }, null, 2));
}

const saldoPath = path.join(__dirname, "./database/saldoOtp.json");
const trxPath = path.join(__dirname, "./database/transaksi.json");
const scriptStorePath = path.join(__dirname, "./database/storeScript.json");
if (!fs.existsSync(scriptStorePath)) fs.writeFileSync(scriptStorePath, JSON.stringify([], null, 2));

const resellerPath = path.join(__dirname, "./database/reseller.json");
if (!fs.existsSync(resellerPath)) fs.writeFileSync(resellerPath, JSON.stringify([], null, 2));

const resBalancePath = path.join(__dirname, "./database/resellerBalance.json");
if (!fs.existsSync(resBalancePath)) fs.writeFileSync(resBalancePath, JSON.stringify({}, null, 2));

function loadResBalance() {
    try { return JSON.parse(fs.readFileSync(resBalancePath)); } catch { return {}; }
}

function saveResBalance(data) {
    fs.writeFileSync(resBalancePath, JSON.stringify(data, null, 2));
}

function checkReseller(userId) {
  try {
    const db = JSON.parse(fs.readFileSync(resellerPath, "utf8"));
    return db.some(user => user.id === userId.toString());
  } catch (e) {
    return false;
  }
}

const voucherPath = path.join(__dirname, "./database/vouchers.json");
const activeDiscountPath = path.join(__dirname, "./database/active_discounts.json");

if (!fs.existsSync(voucherPath)) fs.writeFileSync(voucherPath, JSON.stringify([], null, 2));
if (!fs.existsSync(activeDiscountPath)) fs.writeFileSync(activeDiscountPath, JSON.stringify({}, null, 2));

function loadVoucher() {
  try { return JSON.parse(fs.readFileSync(voucherPath)); } catch { return []; }
}

function saveVoucher(data) {
  fs.writeFileSync(voucherPath, JSON.stringify(data, null, 2));
}

function loadActiveDiscount() {
  try { return JSON.parse(fs.readFileSync(activeDiscountPath)); } catch { return {}; }
}

function saveActiveDiscount(data) {
  fs.writeFileSync(activeDiscountPath, JSON.stringify(data, null, 2));
}

function applyDiscount(userId, originalPrice) {
    const discounts = loadActiveDiscount();
    if (!discounts[userId]) return { finalPrice: originalPrice, discountAmount: 0, code: null, percent: 0 };

    const { code, percent } = discounts[userId];
    const discountAmount = Math.floor((originalPrice * percent) / 100);
    const finalPrice = originalPrice - discountAmount;

    return { finalPrice, discountAmount, code, percent };
}

function useDiscount(userId) {
    const discounts = loadActiveDiscount();
    if (discounts[userId]) {
        delete discounts[userId];
        saveActiveDiscount(discounts);
    }
}

const { 
  getRuntime,
  getTotalUsers,
  getUserSaldo,
  setUserSaldo,
  toIDR,
  toRupiah,
  toIDRSimple,
  formatRupiah,
  generateRandomNumber,
  randomHex,
  generateRandomPassword,
  getWaktuIndonesia,
  dateTime
} = require("./database/Function");

// ====================================================
// 🔧 UTIL
// ====================================================

function logError(err, where = "Unknown") {
  const time = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  const text = `[${time}] [${where}]\n${err.stack || err}\n\n`;
  console.error(text);
  fs.appendFileSync("error.log", text);
}

function updateConfig(key, value) {
  let fileData = fs.readFileSync(configPath, "utf8");

  // boolean harus tanpa kutip
  const val = typeof value === "boolean" ? value : value;

  const regex = new RegExp(`${key}:\\s*(.*?),`);
  fileData = fileData.replace(regex, `${key}: ${val},`);

  fs.writeFileSync(configPath, fileData);

  // CLEAR CACHE DAN RELOAD
  delete require.cache[require.resolve("./config.js")];
  config = require("./config.js");
}

function saveUser(userId) {
  const fs = require("fs");
  const file = "./users.json";
  let db = [];

  if (fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file));
  }

  if (!db.includes(userId)) {
    db.push(userId);
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
    return true; // menandakan user baru
  }
  return false; // user sudah ada
}

function userHasStarted(userId) {
  const fs = require("fs");
  const file = "./users.json";

  if (!fs.existsSync(file)) return false;

  const db = JSON.parse(fs.readFileSync(file));
  return db.includes(userId);
}

function checkJoinChannel() {
  try {
    return JSON.parse(fs.readFileSync(joinChFile)).status;
  } catch {
    return false;
  }
}

function checkMaintenance() {  
  try {  
    return JSON.parse(fs.readFileSync(maintenanceFile)).status;  
  } catch {  
    return false;  
  }  
}  

function checkGroupOnly() {  
  try {  
    return JSON.parse(fs.readFileSync(groupOnlyFile)).status;  
  } catch {  
    return false;  
  }  
}  

function checkSelfMode() {  
  try {  
    return JSON.parse(fs.readFileSync(modeFile)).self;  
  } catch {  
    return false;  
  }  
}  

let jadwalSholatCache = {};
let tanggalTerakhirCek = "";
let lastNotifiedTime = ""; 
const ADZAN_URL = "https://files.catbox.moe/4ok0n0.mp3";

async function getJadwal() {
    try {
        const moment = require('moment-timezone');
        const axios = require('axios');
        const now = moment().tz("Asia/Jakarta");
        const dateKey = now.format("YYYY-MM-DD");
        
        if (jadwalSholatCache[dateKey]) return jadwalSholatCache[dateKey];
        
        const { data } = await axios.get(`https://api.myquran.com/v2/sholat/jadwal/1301/${now.format("YYYY")}/${now.format("MM")}/${now.format("DD")}`);
        if (data?.status && data?.data?.jadwal) {
            jadwalSholatCache[dateKey] = data.data.jadwal;
            return data.data.jadwal;
        }
    } catch (e) {}
    return null;
}

setInterval(async () => {
    try {
        const moment = require('moment-timezone');
        const fs = require('fs');
        const now = moment().tz("Asia/Jakarta");
        const timeNow = now.format("HH:mm");
        const dateNow = now.format("YYYY-MM-DD");

        if (lastNotifiedTime === timeNow) return;

        if (tanggalTerakhirCek !== dateNow) {
            await getJadwal();
            tanggalTerakhirCek = dateNow;
        }

        const jadwal = await getJadwal();
        if (!jadwal) return;

        const times = {
            "Subuh": jadwal.subuh,
            "Dzuhur": jadwal.dzuhur,
            "Ashar": jadwal.ashar,
            "Maghrib": jadwal.maghrib,
            "Isya": jadwal.isya
        };

        for (const [name, time] of Object.entries(times)) {
            if (timeNow === time) {
                lastNotifiedTime = timeNow;

                const userPath = "./users.json";
                if (!fs.existsSync(userPath)) return;
                const users = JSON.parse(fs.readFileSync(userPath));

                const textMessage = `<blockquote><b>🕌 KUMANDANG AZAN (WIB)</b>\n\nAlhamdulillah, waktu <b>${name.toUpperCase()}</b> telah tiba untuk wilayah Jakarta dan sekitarnya.\n\nMari tunaikan ibadah sholat berjamaah.</blockquote>`;
                const audioCaption = `ADZAN ${name.toUpperCase()}`;

                for (let user of users) {
                    try {
                        await bot.sendMessage(user, textMessage, { parse_mode: "HTML" });
                        await bot.sendVoice(user, ADZAN_URL, { caption: audioCaption, parse_mode: "Markdown" });
                        await new Promise(r => setTimeout(r, 1000)); 
                    } catch {}
                }
                
                break;
            }
        }
    } catch (e) {}
}, 13000); 

const PAYMENT_INFO = `
💳 <b>METODE PEMBAYARAN</b>

1️⃣ <b>DANA:</b> <code>${config.danapay}</code>
2️⃣ <b>QRIS:</b> <i>${config.qrispay}</i>

⚠️ <b>Wajib kirim bukti screenshot setelah transfer!</b>
`;

function applyDiscount(userId, originalPrice) {
  const activeDiscountPath = require("path").join(__dirname, "./database/active_discounts.json");
  let discounts = {};
  try {
    if (require("fs").existsSync(activeDiscountPath)) {
      discounts = JSON.parse(require("fs").readFileSync(activeDiscountPath));
    }
  } catch {}
  
  if (!discounts[userId]) return { finalPrice: originalPrice, discountAmount: 0, code: null, percent: 0 };

  const { code, percent } = discounts[userId];
  const discountAmount = Math.floor((originalPrice * percent) / 100);
  const finalPrice = Math.max(0, originalPrice - discountAmount);

  return { finalPrice, discountAmount, code, percent };
}

function useDiscount(userId) {
  const activeDiscountPath = require("path").join(__dirname, "./database/active_discounts.json");
  let discounts = {};
  try {
    if (require("fs").existsSync(activeDiscountPath)) {
      discounts = JSON.parse(require("fs").readFileSync(activeDiscountPath));
    }
  } catch {}

  if (discounts[userId]) {
    delete discounts[userId];
    require("fs").writeFileSync(activeDiscountPath, JSON.stringify(discounts, null, 2));
  }
}

// ====================== 🧱 GUARD UTAMA (BLOKIR GLOBAL + COOLDOWN) ======================
const cooldownMap = new Map(); // simpan waktu cooldown user

async function guardAll(x) {
  const isCallback = x.data !== undefined;
  const userId = isCallback ? x.from.id.toString() : x.from.id.toString();
  const chatId = isCallback ? x.message.chat.id : x.chat.id;
  const isPrivate = isCallback ? x.message.chat.type === "private" : x.chat.type === "private";
  const answer = (text, alert = true) => {
    if (isCallback) {
      return bot.answerCallbackQuery(x.id, { text, show_alert: alert });
    } else {
      return bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
    }
  };

  const channelUsername = config.urlchannel.replace("https://t.me/", "").replace("@", "");
  const isOwner = userId === config.OWNER_ID.toString();

  // === ⚙️ CEK WAJIB JOIN CHANNEL ===
  if (checkJoinChannel() && isPrivate && !isOwner) {
    try {
      const member = await bot.getChatMember(`@${channelUsername}`, userId);
      const isJoined = ["member", "administrator", "creator"].includes(member.status);

      if (!isJoined) {
        if (!isCallback) {
          await bot.sendMessage(chatId, `
🚫 *Akses Ditolak!*
Kamu harus bergabung ke channel resmi terlebih dahulu untuk menggunakan bot ini.

🔗 [Join Channel](${config.urlchannel})

Setelah bergabung, tekan tombol di bawah ini.`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "✅ Sudah Join", callback_data: "cek_join_guard" }],
                  [{ text: "🔗 Join Channel", url: config.urlchannel }]
                ]
              }
            }
          );
        } else {
          await answer("❌ Kamu belum join channel.", true);
        }
        return true;
      }
    } catch (e) {
      console.log("⚠️ Gagal cek channel:", e.message);
    }
  }

  // === 🔒 Blacklist ===
  try {
    const blacklist = JSON.parse(fs.readFileSync(blacklistFile, "utf8"));
    const isBlacklisted = blacklist.find((u) => u.id === userId);
    if (isBlacklisted && !isOwner) {
      await answer(
        `🚫 *Akses Ditolak!*\nKamu telah diblacklist dari penggunaan bot.\n\n📋 *Alasan:* ${isBlacklisted.alasan}\n🕐 *Waktu:* ${isBlacklisted.waktu}\n\nHubungi admin jika ini kesalahan.`,
        true
      );
      return true;
    }
  } catch (err) {
    console.error("❌ Error membaca blacklist:", err);
  }

  // === ⚙️ Maintenance ===
  if (checkMaintenance() && !isOwner) {
    await answer("⚙️ Bot sedang *maintenance*. Silakan coba lagi nanti.", true);
    return true;
  }

  // === 🚫 Group-only ===
  if (checkGroupOnly() && isPrivate && !isOwner) {
    await answer("🚫 Bot hanya bisa digunakan di *grup* untuk sementara.", true);
    return true;
  }

  // === 🤫 Self Mode ===
  if (checkSelfMode() && !isOwner) return true;

  return false;
}

global.guardAll = guardAll;

// =====================================================
// 🔁 CALLBACK UNTUK TOMBOL "✅ SUDAH JOIN"
// =====================================================
bot.on("callback_query", async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id;

  if (userId === config.OWNER_ID.toString()) {
    if (data === "cek_join_guard") {
      await bot.answerCallbackQuery(query.id, { text: "OWNER detected ✓", show_alert: false });
      return bot.sendMessage(chatId, "🚀 Owner tidak perlu join channel.");
    }
    return;
  }

  if (data !== "cek_join_guard") return;
  
  const channelUsername = config.urlchannel.replace("https://t.me/", "").replace("@", "");

  try {
    const member = await bot.getChatMember(`@${channelUsername}`, userId);
    const isJoined = ["member", "administrator", "creator"].includes(member.status);

    if (isJoined) {
      await bot.deleteMessage(chatId, messageId).catch(() => {});
      await bot.answerCallbackQuery(query.id, { text: "✅ Kamu sudah berhasil join channel!", show_alert: false });
      await bot.sendMessage(chatId, "✅ Terima kasih sudah berhasil join! Sekarang kamu bisa menggunakan bot.");
    } else {
      await bot.answerCallbackQuery(query.id, { text: "🚫 Kamu belum join channel!", show_alert: true });
    }
  } catch (e) {
    console.log("⚠️ Error cek ulang channel:", e.message);
    await bot.answerCallbackQuery(query.id, { text: "⚠️ Gagal cek channel!", show_alert: true });
  }
});

//##################################//
// Logs Message In Console
bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (!msg.text.startsWith("/")) return;

  const command = msg.text.split(" ")[0].toLowerCase();
  const userId = msg.from.id;
  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
  const chatType = msg.chat.type === "private"
    ? "Private"
    : `Public (${msg.chat.title || "Group Tanpa Nama"})`;

  // Format tanggal Indonesia
  const waktu = moment().tz("Asia/Jakarta");
  const tanggal = waktu.format("DD/MMMM/YYYY"); // contoh: 23/September/2025
  const hari = waktu.format("dddd"); // contoh: Senin

  console.log(
    chalk.blue.bold("Messages Detected 🟢") +
    chalk.white.bold("\n▢ Command : ") + chalk.green.bold(command) +
    chalk.white.bold("\n▢ Pengirim : ") + chalk.magenta.bold(userId) +
    chalk.white.bold("\n▢ Name : ") + chalk.red.bold(username) +
    chalk.white.bold("\n▢ Chat Type : ") + chalk.yellow.bold(chatType) +
    chalk.white.bold("\n▢ Tanggal : ") + chalk.cyan.bold(`${hari}, ${tanggal}\n`)
  );
});

// ==================== ⚡ SYSTEM LOG : AUTO SAVE ID ====================
bot.on("message", (msg) => {
  if (!msg.from) return;

  // ⛔ ABAIKAN PESAN REFERRAL (tidak disimpan)
  if (msg.text && msg.text.startsWith("/start ref_")) return;

  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
  const userId = msg.from.id.toString();
  const waktu = moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm:ss");

  const usersFile = path.join(__dirname, "users.json");
  let users = [];

  if (fs.existsSync(usersFile)) {
    try {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    } catch {
      users = [];
    }
  }

  if (!users.includes(userId)) {
    users.push(userId);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    const totalID = users.length;

    bot.sendMessage(
      config.OWNER_ID,
      `
🕶️ *[ CYBER DATABASE UPDATE ]*
━━━━━━━━━━━━━━━━━━━━━━━
🧠 *New User Signature Detected*

👤 *Agent:* ${username}
🆔 *ID Code:* \`${userId}\`
🕒 *Timestamp:* ${waktu}
📊 *Registry Count:* ${totalID}

📡 *Status:* _Identity archived into mainframe._
━━━━━━━━━━━━━━━━━━━━━━━
💀 *System Node Sync Completed*
#AutoSaveID #CyberCore
`,
      { parse_mode: "Markdown" }
    );
  }
});

const sendMessage = (chatId, text) => bot.sendMessage(chatId, text);
bot.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "ownermenu", description: "Fitur Only Owner" }
]);

// =====================
const sessionPath = path.join(__dirname, 'sessioncs.json');

let contactSession = {};
let terminatedSession = {};
let forwardedMap = {};

// Load session dari file jika ada
if (fs.existsSync(sessionPath)) {
  const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  contactSession = data.contactSession || {};
  terminatedSession = data.terminatedSession || {};
  forwardedMap = data.forwardedMap || {};
}

// Simpan session ke file
function saveSession() {
  fs.writeFileSync(sessionPath, JSON.stringify({ contactSession, terminatedSession, forwardedMap }, null, 2));
}

async function handleReferralStart(msg) {
  const fs = require("fs");
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const config = require("./config.js");

  try {
    const text = msg.text || "";
    if (!text.startsWith("/start ref_")) return;

    // === PASTIKAN refCode DIDEKLARASIKAN SEBELUM DIPAKAI ===
    const refCode = text.replace("/start ", "").trim();

    // === Load SystemReferral (safe) ===
    const sysPath = "./database/SystemReferral.json";
    let sysRef = { Referral_Enabled: true, Referral_PerUser: 0, Referral_PerDaftar: 0 };
    if (fs.existsSync(sysPath)) {
      try {
        const raw = fs.readFileSync(sysPath, "utf8");
        sysRef = JSON.parse(raw);
      } catch (e) {
        // jika rusak → anggap disabled supaya aman
        console.error("SystemReferral.json parse error:", e.message);
        sysRef = { Referral_Enabled: false, Referral_PerUser: 0, Referral_PerDaftar: 0 };
      }
    }

    // Jika referral OFF → beritahu user dan (opsional) owner pemilik kode
    if (!sysRef.Referral_Enabled) {
      // Notifikasi user yang klik link
      await bot.sendMessage(chatId,
        "🔴 <b>Sistem referral sedang berhasil DI NONAKTIF oleh owner.</b>\nReferral tidak dapat digunakan saat ini.",
        { parse_mode: "HTML" }
      ).catch(()=>{});

      // Opsional notif owner kode (jika file kode ada dan owner ditemukan)
      try {
        const codeFile = "./database/referralCode.json";
        if (fs.existsSync(codeFile)) {
          const referralCodes = JSON.parse(fs.readFileSync(codeFile, "utf8"));
          const ownerEntry = Object.entries(referralCodes).find(e => `ref_${e[1]}` === refCode);
          if (ownerEntry) {
            const ownerId = ownerEntry[0];
            await bot.sendMessage(ownerId,
              `⚠️ Referral tidak diproses: user <code>${userId}</code> mengklik link ref kamu,\nnamun sistem referral sedang OFF.`,
              { parse_mode: "HTML" }
            ).catch(()=>{});
          }
        }
      } catch (e) {
        console.error("Notif owner failed:", e.message);
      }

      return; // STOP TOTAL
    }

    // === File kode referral (safe parse) ===
    const codeFile = "./database/referralCode.json";
    if (!fs.existsSync(codeFile)) return; // no codes

    let referralCodes = {};
    try {
      referralCodes = JSON.parse(fs.readFileSync(codeFile, "utf8"));
    } catch (e) {
      console.error("referralCode.json parse error:", e.message);
      return;
    }

    const ownerCode = Object.entries(referralCodes).find(e => `ref_${e[1]}` === refCode);
    if (!ownerCode) return; // kode tidak valid

    const ownerId = ownerCode[0];

    // 🚫 Anti refer diri sendiri
    if (ownerId === userId) {
      return bot.sendMessage(chatId, "❌ Kamu tidak bisa memakai kode referral milik sendiri.");
    }

    // 🚫 Cek jika user sudah pernah pakai bot → referral gagal
    if (typeof userHasStarted === "function" && userHasStarted(userId)) {
      // Notifikasi ke owner referral
      bot.sendMessage(
        ownerId,
        `⚠️ <b>Referral Gagal</b>\n\n` +
        `👤 User: <code>${userId}</code>\n` +
        `📌 Alasan: User sudah pernah menggunakan bot sebelumnya.\n` +
        `❌ Bonus tidak diberikan.`,
        { parse_mode: "HTML" }
      ).catch(()=>{});

      return bot.sendMessage(chatId,
        "ℹ️ Kamu sudah pernah menggunakan bot sebelumnya, jadi referral tidak bisa dipakai.",
        { parse_mode: "HTML" }
      ).catch(()=>{});
    }

    // ===============================
    // 📌 Load referral database (safe)
    // ===============================
    const referralDB = "./database/referral.json";
    let referralData = {};
    if (fs.existsSync(referralDB)) {
      try {
        const raw = fs.readFileSync(referralDB, "utf8");
        referralData = JSON.parse(raw);
      } catch (e) {
        console.error("referral.json parse error:", e.message);
        referralData = {};
      }
    }

    // Ambil bonus dari SystemReferral (sudah aman di atas)
    const BONUS_REFERRAL = Number(sysRef.Referral_PerUser) || 0;  // Bonus untuk owner kode
    const BONUS_REFERRED = Number(sysRef.Referral_PerDaftar) || 0; // Bonus untuk user baru

    // Simpan data referral baru
    referralData[userId] = {
      referrerId: refCode,
      newUser: userId,
      bonus: BONUS_REFERRAL,
      date: new Date().toISOString(),
    };

    fs.writeFileSync(referralDB, JSON.stringify(referralData, null, 2));

    // ==========================================================
    // 🔥 UPDATE SALDO OTOMATIS (safe)
    // ==========================================================
    const saldoFile = "./database/saldoOtp.json";
    if (!fs.existsSync(saldoFile)) {
      fs.writeFileSync(saldoFile, JSON.stringify({}, null, 2));
    }

    let saldo = {};
    try {
      saldo = JSON.parse(fs.readFileSync(saldoFile, "utf8"));
    } catch (e) {
      saldo = {};
    }

    // Pastikan user & owner punya saldo
    if (!saldo[userId]) saldo[userId] = 0;
    if (!saldo[ownerId]) saldo[ownerId] = 0;

    // Tambah saldo
    saldo[userId] = Number(saldo[userId]) + Number(BONUS_REFERRED);
    saldo[ownerId] = Number(saldo[ownerId]) + Number(BONUS_REFERRAL);

    // Simpan saldo
    fs.writeFileSync(saldoFile, JSON.stringify(saldo, null, 2));

    // ==========================================================
    // 🔔 NOTIFIKASI
    // ==========================================================
    // Notifikasi ke owner kode referral
    bot.sendMessage(
      ownerId,
      `🎉 <b>Referral Baru!</b>\n\n` +
      `👤 User: <code>${userId}</code>\n` +
      `💰 Bonus saldo berhasil Diterima: <b>Rp ${BONUS_REFERRAL.toLocaleString("id-ID")}</b>\n` +
      `💼 Saldo Baru: Rp ${saldo[ownerId].toLocaleString("id-ID")}`,
      { parse_mode: "HTML" }
    ).catch(()=>{});

    // Notifikasi ke user baru
    bot.sendMessage(
      chatId,
      `🎁 Kamu berhasil mendapatkan bonus saldo <b>Rp ${BONUS_REFERRED.toLocaleString("id-ID")}</b> dari referral!\n` +
      `💼 Saldo Baru: Rp ${saldo[userId].toLocaleString("id-ID")}`,
      { parse_mode: "HTML" }
    ).catch(()=>{});

  } catch (err) {
    console.error("handleReferralStart error:", err);
  }
}

// ====================================================
// 🧾 COMMANDS — BOT.ONTEXT
// ====================================================
bot.onText(/^\/start(?:\s+.+)?$/, async (msg) => {
  try {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username ? `@${msg.from.username}` : "❌ Tidak ada username";
  const name = msg.from.first_name || "Tanpa Nama";
  const config = require("./config.js");
    

      if (await guardAll(msg)) return;
await handleReferralStart(msg);
saveUser(msg.from.id.toString()); // <— universal save

    // =====================================================
    // 🔹 LOAD SYSTEM REFERRAL FROM JSON (BUKAN DARI CONFIG)
    // =====================================================
    const sysPath = "./database/SystemReferral.json";
    let sys = { Referral_Enabled: false, Referral_PerUser: 0, Referral_PerDaftar: 0 };

    if (fs.existsSync(sysPath)) {
      sys = JSON.parse(fs.readFileSync(sysPath));
    }

    const BONUS_REFERRAL = sys.Referral_PerUser || 0;
    const BONUS_REFERRED = sys.Referral_PerDaftar || 0;    
  
    // 🔹 Ambil total pengguna dari users.json
    const usersFile = "./users.json";
    let totalUsers = 0;

    if (fs.existsSync(usersFile)) {
      const dataUsers = JSON.parse(fs.readFileSync(usersFile));
      if (Array.isArray(dataUsers)) {
        totalUsers = dataUsers.length;
      }
    }

    // === Pesan /ownermenu ===
    const caption = `╭━〔 <b>ORDER NOMOR VIRTUAL</b> 〕━╮

<blockquote>Halo <b>${name}</b> 👋  
Selamat datang di layanan nomor virtual <b>MANZZY ID OFFICIAL</b></blockquote>
╭────────────────────────
┣━⊳ 📊 <b>STATUS AKUN ANDA</b>  
┃• 👤 <b>Nama:</b> ${name}
┃• 🆔 <b>ID Pengguna:</b> <code>${userId}</code>
┃• 🔗 <b>Username:</b> ${username}
┃• 👥 <b>Total Pengguna:</b> <b>${totalUsers.toLocaleString("id-ID")}</b> orang
╭────────────────────────
┃🛍️ LAYANAN TERSEDIA
╰────────────────────────
┃• 📱 Nomor Virtual Untuk <b>Banyak Aplikasi</b>    
┃• 📦 Setor & Buy Noktel
┃• 🗂️ Script Bot/Source Code
╭────────────────────────
┃🔥 <b>KEUNGGULAN LAYANAN KAMI</b>
┃ 
┃✅ Proses 100% Otomatis & Instan
┃✅ Keamanan Data Terjamin
┃✅ Harga Termurah Mulai Dari Rp2.000
┃✅ Layanan Aktif 24 Jam Non-Stop
┃🤝 <b>Bonus Referral</b> – Dapatkan Rp${BONUS_REFERRAL.toLocaleString("id-ID")} Setiap Teman Yang Daftar
╰───────────────────────╯
<blockquote>🚀 <b>GASKEUN CUY ORDER SEKARANG!</b> 
Pilih Menu Dibawah Untuk Menikmati Semua Fitur Menarik Kami.</blockquote>
`;

    // === Inline Keyboard ===
    const buttons = {
      reply_markup: {
        inline_keyboard: [
      [
        { text: "📱 ORDER NOKOS VIRTUAL", callback_data: "choose_service" }
      ],
      [
        { text: "💳 CEK SALDO", callback_data: "profile" },
        { text: "💰 TOPUP SALDO", callback_data: "topup_nokos" },
        { text: "🗂️ BUY SCRIPT", callback_data: "store_script_menu" }
      ],
      [
        { text: "🛒 HISTORY ORDER", callback_data: "history_orderbot" },
        { text: "📊 HISTORY DEPOSIT", callback_data: "riwayat_deposit" },
        { text: "🎁 REFERRAL", callback_data: "bonus_referral" }
      ],
      [
        { text: "🎫 VOUCHER SAYA", callback_data: "my_voucher" },
        { text: "📞 BANTUAN CS", callback_data: "open_support_info" },
        { text: "❓ PANDUAN", callback_data: "panduan_user" }
      ],
      [
        { text: "🏆 LIST TOP USER", callback_data: "listtop_user" },
        { text: "⭐ RATING & ULASAN", callback_data: "lihat_rating" }
      ],
      [{ text: "📥 SETOR & BUY NOKTEL", callback_data: "setor_akun_menu" }],
        ],
      },
      parse_mode: "HTML",
    };

    // === Kirim foto dengan caption + tombol ===
    await bot.sendPhoto(msg.chat.id, config.ppthumb, {
      caption,
      ...buttons,
    });

    // ====================================================
    // 🗑️ BAGIAN NOTIF OWNER DIHAPUS SEPENUHNYA
    // ====================================================

  } catch (err) {
    logError(err, "/start");
  }
});
// ==============================================
// 💠 CALLBACK HANDLER — VirtuSIM Marketplace (FIXED)
// ==============================================
bot.on("callback_query", async (callbackQuery) => {
  const { message, data, from } = callbackQuery;
  const chatId = message?.chat?.id;
  const userId = from?.id;
  const messageId = message?.message_id;
  const axios = require("axios");
  const API_KEY = config.RUMAHOTP;
  const perPage = 20;

  // 🧩 Inisialisasi cache global jika belum ada
  if (!global.cachedServices) global.cachedServices = [];
  if (!global.cachedCountries) global.cachedCountries = {};
  if (!global.lastServicePhoto) global.lastServicePhoto = {};
  if (!global.lastCountryPhoto) global.lastCountryPhoto = {};

  try {

// ===============================
// 📦 PILIH SERVICE (DAFTAR APLIKASI OTP)
// ===============================
if (data === "choose_service") {
    const page = 1;
    const perPage = 20;

    // 💬 LANGSUNG UBAH CAPTION MENJADI LOADING
    await bot.editMessageCaption("⏳ *Memuat daftar layanan...*", {
        chat_id: chatId,
        message_id: message.message_id,
        parse_mode: "Markdown"
    }).catch(() => {});

    try {
        const response = await axios.get("https://www.rumahotp.io/api/v2/services", {
            headers: { "x-apikey": API_KEY }
        });

        if (!response.data.success || !Array.isArray(response.data.data)) {
            throw new Error("API tidak valid");
        }

        const services = response.data.data;
        global.cachedServices = services;

        const totalPages = Math.ceil(services.length / perPage);

        const makeKeyboard = (page) => {
            const start = (page - 1) * perPage;
            const end = start + perPage;
            const list = services.slice(start, end);

            const keyboard = list.map((srv) => [
                {
                    text: `${srv.service_name} | ID ${srv.service_code}`,
                    callback_data: `service_${srv.service_code}`
                }
            ]);

            const nav = [];
            if (page > 1) nav.push({ text: "⬅️ Prev", callback_data: `choose_service_page_${page - 1}` });
            if (page < totalPages) nav.push({ text: "➡️ Next", callback_data: `choose_service_page_${page + 1}` });

            if (nav.length) keyboard.push(nav);

            keyboard.push([{ text: `📖 Hal ${page}/${totalPages}`, callback_data: "noop" }]);
            keyboard.push([{ text: "🏠 Kembali Ke Menu Utama", callback_data: "back_home" }]);

            return keyboard;
        };

        const caption = `
📲 *Daftar Aplikasi OTP*

Silakan pilih salah satu aplikasi untuk melanjutkan.
📄 Halaman ${page} dari ${totalPages}
💡 Total layanan: ${services.length}
`;

        // 🖼️ EDIT FOTO + CAPTION SEKALIGUS JADI LIST SERVICE
        await bot.editMessageMedia(
            {
                type: "photo",
                media: config.ppthumb,
                caption,
                parse_mode: "Markdown"
            },
            {
                chat_id: chatId,
                message_id: message.message_id,
                reply_markup: { inline_keyboard: makeKeyboard(page) }
            }
        );

        global.lastServicePhoto[userId] = {
            chatId,
            messageId: message.message_id
        };

    } catch (err) {
        await bot.editMessageCaption("❌ *Gagal memuat daftar layanan.*", {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: "Markdown"
        });
    }
}
if (data.startsWith("choose_service_page_")) {
    const perPage = 20;
    const page = Number(data.split("_").pop());
    const services = global.cachedServices;

    if (!services || services.length === 0) {
        return bot.sendMessage(chatId, "⚠️ Data layanan tidak ditemukan. Silakan jalankan /start.");
    }

    const lastPhoto = global.lastServicePhoto[userId];
    if (!lastPhoto)
        return bot.sendMessage(chatId, "⚠️ Tidak dapat menemukan daftar sebelumnya. Silakan klik Layanan Nokos lagi.");

    const { chatId: pChat, messageId } = lastPhoto;
    const totalPages = Math.ceil(services.length / perPage);

    const makeKeyboard = (page) => {
        const start = (page - 1) * perPage;
        const end = start + perPage;
        const currentPage = services.slice(start, end);

        const keyboard = currentPage.map((srv) => [
            {
                text: `${srv.service_name} | ID ${srv.service_code}`,
                callback_data: `service_${srv.service_code}`
            }
        ]);

        const nav = [];
        if (page > 1)
            nav.push({ text: "⬅️ Prev", callback_data: `choose_service_page_${page - 1}` });
        if (page < totalPages)
            nav.push({ text: "➡️ Next", callback_data: `choose_service_page_${page + 1}` });

        if (nav.length) keyboard.push(nav);

        keyboard.push([{ text: `📖 Hal ${page}/${totalPages}`, callback_data: "noop" }]);
        keyboard.push([{ text: "🏠 Kembali Ke Menu Utama", callback_data: "back_home" }]);

        return keyboard;
    };

    const caption = `
📲 *Daftar Aplikasi OTP*

Silakan pilih salah satu aplikasi untuk melanjutkan.
📄 Halaman ${page} dari ${totalPages}
💡 Total layanan: ${services.length}
`;

    await bot.editMessageCaption(caption, {
        chat_id: pChat,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: makeKeyboard(page) },
    });
}
// ======================================================
// 🌍 PILIH NEGARA — V8 (Caption Loading FIX)
// ======================================================
if (data.startsWith("service_") || data.startsWith("countrylist_")) {
    const axios = require("axios");
    const apiKey = config.RUMAHOTP;

    let serviceId, page = 1;
    let isPagination = false;

    if (data.startsWith("service_")) {
        serviceId = data.split("_")[1];
    }

    if (data.startsWith("countrylist_")) {
        const parts = data.split("_");
        serviceId = parts[1];
        page = Number(parts[2]);
        isPagination = true;
    }

    bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

    // =====================================
    // ✔ FIX: Saat user klik service → caption jadi loading
    // =====================================
    if (!isPagination) {
        let serviceName = "Layanan Tidak Dikenal";
        if (global.cachedServices) {
            const s = global.cachedServices.find(a => a.service_code == serviceId);
            if (s) serviceName = s.service_name;
        }

        await bot.editMessageCaption(
            `⏳ *Memuat negara untuk layanan ${serviceName} (ID ${serviceId})...*`,
            {
                chat_id: chatId,
                message_id: message.message_id,
                parse_mode: "Markdown"
            }
        ).catch(() => {});
    }

    try {
        // Cache country per service
        if (!global.cachedCountries) global.cachedCountries = {};
        if (!global.cachedCountries[serviceId]) {
            const res = await axios.get(
                `https://www.rumahotp.io/api/v2/countries?service_id=${serviceId}`,
                { headers: { "x-apikey": apiKey, Accept: "application/json" } }
            );

            if (!res.data.success) throw new Error("API Error");

            global.cachedCountries[serviceId] = res.data.data.filter(
                x => x.pricelist && x.pricelist.length > 0
            );
        }

        const countries = global.cachedCountries[serviceId];
        const totalCountries = countries.length;

        if (totalCountries === 0) {
            return bot.editMessageCaption(
                "⚠️ *Tidak ada negara untuk layanan ini.*",
                {
                    chat_id: chatId,
                    message_id: message.message_id,
                    parse_mode: "Markdown"
                }
            );
        }

        const perPage = 20;
        const totalPages = Math.ceil(totalCountries / perPage);

        const start = (page - 1) * perPage;
        const slice = countries.slice(start, start + perPage);

        let serviceName = "Layanan Tidak Dikenal";
        if (global.cachedServices) {
            const s = global.cachedServices.find(a => a.service_code == serviceId);
            if (s) serviceName = s.service_name;
        }

        const keyboard = slice.map(c => [
            {
                text: `${c.name} (${c.prefix}) | stok ${c.stock_total}`,
                callback_data: `country_${serviceId}_${c.iso_code}_${c.number_id}`
            }
        ]);

        const nav = [];
        if (page > 1)
            nav.push({
                text: "⬅️ Prev",
                callback_data: `countrylist_${serviceId}_${page - 1}`
            });

        if (page < totalPages)
            nav.push({
                text: "➡️ Next",
                callback_data: `countrylist_${serviceId}_${page + 1}`
            });

        if (nav.length) keyboard.push(nav);

        keyboard.push([{ text: `📖 Hal ${page}/${totalPages}`, callback_data: "noop" }]);
        keyboard.push([{ text: "⬅️ Kembali", callback_data: "choose_service" }]);

        const caption = `
🌍 *Pilih Negara*
Layanan: *${serviceName} (ID ${serviceId})*
Halaman: *${page}/${totalPages}*
🌏 Total Negara: *${totalCountries}*
`;

        // ===================================
        // ✔ Jika pagination → hanya edit caption
        // ===================================
        if (isPagination && global.lastCountryPhoto) {
            return bot.editMessageCaption(caption, {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: keyboard }
            }).catch(() => {});
        }

        // ===================================
        // ✔ Jika klik pertama → replace foto /start
        // ===================================
        const sent = await bot.editMessageMedia(
            {
                type: "photo",
                media: config.ppthumb,
                caption,
                parse_mode: "Markdown"
            },
            {
                chat_id: chatId,
                message_id: message.message_id,
                reply_markup: { inline_keyboard: keyboard }
            }
        );

        global.lastCountryPhoto = {
            chatId,
            messageId: message.message_id
        };

    } catch (err) {
        console.log("⚠ ERROR:", err);
        await bot.editMessageCaption("❌ *Gagal memuat negara.*", {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: "Markdown"
        });
    }
}
// ===============================
// 💰 PILIH HARGA DARI NEGARA — V8 (Caption langsung loading)
// ===============================
if (data.startsWith("country_")) {
    const [, serviceId, isoCode, numberId] = data.split("_");
    const axios = require("axios");
    const apiKey = config.RUMAHOTP;

    const resellerPath = require("path").join(__dirname, "./database/reseller.json");
    let isReseller = false;
    try {
        if (require("fs").existsSync(resellerPath)) {
            const dbRes = JSON.parse(require("fs").readFileSync(resellerPath));
            isReseller = dbRes.some(u => u.id === from.id.toString());
        }
    } catch {}
    const UNTUNG_NOKOS = isReseller ? 0 : (config.UNTUNG_NOKOS || 0);

    let serviceName = "Layanan Tidak Dikenal";
    if (global.cachedServices) {
        const s = global.cachedServices.find(a => a.service_code == serviceId);
        if (s) serviceName = s.service_name;
    }

    if (global.lastCountryPhoto) {
        await bot.editMessageCaption(
            `⏳ *Memuat harga untuk negara ${isoCode.toUpperCase()} di layanan ${serviceName}...*`,
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "Markdown"
            }
        ).catch(() => {});
    }

    try {
        let negara = null;

        if (global.cachedCountries && global.cachedCountries[serviceId]) {
            negara = global.cachedCountries[serviceId].find(
                c => String(c.number_id) === String(numberId)
            );
        }

        if (!negara) {
            const res = await axios.get(
                `https://www.rumahotp.io/api/v2/countries?service_id=${serviceId}`,
                { headers: { "x-apikey": apiKey } }
            );
            negara = (res.data?.data || []).find(
                c => String(c.number_id) === String(numberId)
            );
        }

        if (!negara) {
            return bot.editMessageCaption(
                `❌ Negara *${isoCode.toUpperCase()}* tidak ditemukan.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "Markdown"
                }
            );
        }

        const providers = (negara.pricelist || [])
            .filter(p => p.available && p.stock > 0)
            .map(p => {
                const base = Number(p.price) || 0;
                const hargaFinal = base + UNTUNG_NOKOS;
                return {
                    ...p,
                    price: hargaFinal,
                    price_format: `Rp${hargaFinal.toLocaleString("id-ID")}`
                };
            })
            .sort((a, b) => a.price - b.price);

        if (providers.length === 0) {
            return bot.editMessageCaption(
                `⚠️ Tidak ada stok tersedia untuk negara *${negara.name}*.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "Markdown"
                }
            );
        }

        const inlineKeyboard = providers.map(p => [
            {
                text: `${p.price_format} 💰 (stok ${p.stock})`,
                callback_data: `buy_${numberId}_${p.provider_id}_${serviceId}`
            }
        ]);

        inlineKeyboard.push([
            { text: "⬅️ Kembali", callback_data: `service_${serviceId}` }
        ]);

        const caption = `
│🌍 Negara: *${negara.name} (${negara.prefix})*
│📦 Layanan: *${serviceName} (ID ${serviceId})*
│
│💵 *Pilih harga:*
(Termurah ➜ Termahal)
╭──────────────────────
│📊 Total Stok: *${negara.stock_total}*
`;

        await bot.editMessageCaption(caption, {
            chat_id: global.lastCountryPhoto.chatId,
            message_id: global.lastCountryPhoto.messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: inlineKeyboard }
        });

    } catch (err) {
        console.log("❌ ERROR:", err);
        await bot.editMessageCaption(
            "❌ *Gagal memuat harga.*",
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "Markdown"
            }
        );
    }
}

// =====================================================
// 📋 DETAIL SETELAH PILIH HARGA — FINAL V10 (No Delete)
// =====================================================
if (data.startsWith("buy_")) {
    const parts = data.split("_");
    const numberId   = parts[1];
    const providerId = parts[2];
    const serviceId  = parts[3];

    const axios = require("axios");
    const apiKey = config.RUMAHOTP;
    const photoThumb = config.ppthumb;

    const resellerPath = require("path").join(__dirname, "./database/reseller.json");
    let isReseller = false;
    try {
        if (require("fs").existsSync(resellerPath)) {
            const dbRes = JSON.parse(require("fs").readFileSync(resellerPath));
            isReseller = dbRes.some(u => u.id === from.id.toString());
        }
    } catch {}
    const UNTUNG_NOKOS = isReseller ? 0 : (config.UNTUNG_NOKOS || 0);

    let serviceName = "Layanan Tidak Dikenal";
    if (global.cachedServices) {
        const svc = global.cachedServices.find(s => String(s.service_code) === String(serviceId));
        if (svc) serviceName = svc.service_name;
    }

    if (global.lastCountryPhoto) {
        await bot.editMessageCaption(
            `⏳ *Memuat detail layanan…*`,
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "Markdown"
            }
        ).catch(() => {});
    }

    try {
        let negara;
        if (global.cachedCountries && global.cachedCountries[serviceId]) {
            negara = global.cachedCountries[serviceId]
                .find(c => String(c.number_id) === String(numberId));
        }

        if (!negara) {
            const res = await axios.get(
                `https://www.rumahotp.io/api/v2/countries?service_id=${serviceId}`,
                { headers: { "x-apikey": apiKey } }
            );
            negara = (res.data?.data || [])
                .find(c => String(c.number_id) === String(numberId));
        }

        if (!negara) {
            return bot.editMessageCaption(
                `❌ Negara tidak ditemukan.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "Markdown"
                }
            );
        }

        const providerData = negara.pricelist
            .find(p => String(p.provider_id) === String(providerId));

        if (!providerData) {
            return bot.editMessageCaption(
                `❌ Provider tidak ditemukan.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "Markdown"
                }
            );
        }

        const base = Number(providerData.price) || 0;
        const hargaFinal = base + UNTUNG_NOKOS;
        const priceFormat = `Rp${hargaFinal.toLocaleString("id-ID")}`;

        global.lastBuyData = {
            serviceName,
            negaraName: negara.name,
            priceFormat,
            providerServer: providerData.server_id || "-"
        };

        const inlineKeyboard = [
            [
                { text: "📡 Pilih Operator", callback_data: `operator_${numberId}_${providerId}_${serviceId}_${negara.iso_code}` }
            ],
            [
                { text: "⬅️ Kembali Ke Harga", callback_data: `country_${serviceId}_${negara.iso_code}_${numberId}` }
            ]
        ];

        const caption = `
│📋 *DETAIL LAYANAN*
╭──────────────────────
│📱 Layanan: *${serviceName}* (ID ${serviceId})
│🌍 Negara: *${negara.name}* (${negara.prefix})
│📦 Provider ID: *${providerId}*
│🔧 Server: *${providerData.server_id || "-"}*
│
│💵 Harga: *${priceFormat}*
│📦 Stok: *${providerData.stock}*
╰──────────────────────
Klik tombol di bawah untuk melanjutkan memilih operator.
`;

        await bot.editMessageMedia(
            {
                type: "photo",
                media: photoThumb,
                caption,
                parse_mode: "Markdown"
            },
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                reply_markup: { inline_keyboard: inlineKeyboard }
            }
        );

    } catch (err) {
        console.error("❌ Error detail:", err?.response?.data || err.message);
        await bot.editMessageCaption(
            "❌ *Gagal memuat detail layanan.*",
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "Markdown"
            }
        );
    }
}

// =====================================================
// 📡 LIST OPERATOR SETELAH PILIH PROVIDER — FINAL V10
// =====================================================
if (data.startsWith("operator_")) {
    const parts = data.split("_");
    const numberId   = parts[1];
    const providerId = parts[2];
    const serviceId  = parts[3];
    const isoCode    = parts[4];

    const axios = require("axios");
    const apiKey = config.RUMAHOTP;

    // =====================================================
    // ✔ UBAH CAPTION MENJADI LOADING (tanpa hapus pesan)
    // =====================================================
    if (global.lastCountryPhoto) {
        await bot.editMessageCaption(
            `⏳ *Memuat daftar operator untuk ${isoCode.toUpperCase()}…*`,
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "Markdown"
            }
        ).catch(()=>{});
    }

    try {
        // 🔥 Ambil cache dari step buy_
        const cached = global.lastBuyData || {};
        const serviceName    = cached.serviceName || "-";
        const negaraName     = cached.negaraName || isoCode.toUpperCase();
        const priceFormat    = cached.priceFormat || "-";
        const providerServer = cached.providerServer || "-";

        // =====================================================
        // AMBIL OPERATOR DARI API
        // =====================================================
        const response = await axios.get(
            `https://www.rumahotp.io/api/v2/operators?country=${encodeURIComponent(negaraName)}&provider_id=${providerId}`,
            { headers: { "x-apikey": apiKey } }
        );

        const operators = response.data?.data || [];

        if (operators.length === 0) {
            return bot.editMessageCaption(
                `⚠️ Tidak ada operator tersedia untuk negara *${negaraName}*.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "Markdown"
                }
            );
        }

        // =====================================================
        // BUAT TOMBOL OPERATOR
        // =====================================================
        const inlineKeyboard = operators.map(op => [
            {
                text: op.name,
                callback_data: `chooseop_${op.id}_${numberId}_${providerId}_${serviceId}_${isoCode}`
            }
        ]);

        inlineKeyboard.push([
            { text: "⬅️ Kembali ke Detail", callback_data: `buy_${numberId}_${providerId}_${serviceId}` }
        ]);

        // =====================================================
        // ✔ UPDATE CAPTION MENJADI LIST OPERATOR
        // =====================================================
        const caption = `
│📡 *PILIH OPERATOR*
╭──────────────────────
│📱*Layanan:* ${serviceName}
│🌍 *Negara:* ${negaraName} (${isoCode.toUpperCase()})
│💠 *Provider:* ${providerId}
│💵 *Harga:* ${priceFormat}
│🔧 *Server:* ${providerServer}
╰──────────────────────
Silakan pilih operator di bawah ini:
`;

        await bot.editMessageCaption(caption, {
            chat_id: global.lastCountryPhoto.chatId,
            message_id: global.lastCountryPhoto.messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: inlineKeyboard }
        });

    } catch (err) {
        console.error("❌ ERROR OPERATOR:", err?.response?.data || err.message);

        await bot.editMessageCaption(
            "❌ *Gagal memuat daftar operator.*",
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "Markdown"
            }
        );
    }
}
// =====================================================
// 📄 DETAIL SETELAH PILIH OPERATOR — FINAL V10 (Edit Caption Only)
// =====================================================
if (data.startsWith("chooseop_")) {
    const parts = data.split("_");
    const operatorId = parts[1];
    const numberId = parts[2];
    const providerId = parts[3];
    const serviceId = parts[4];
    const isoCode = parts[5];

    const axios = require("axios");
    const apiKey = config.RUMAHOTP;
    const photoThumb = config.ppthumb;

    const resellerPath = require("path").join(__dirname, "./database/reseller.json");
    let isReseller = false;
    try {
        if (require("fs").existsSync(resellerPath)) {
            const dbRes = JSON.parse(require("fs").readFileSync(resellerPath));
            isReseller = dbRes.some(u => u.id === from.id.toString());
        }
    } catch {}
    const UNTUNG_NOKOS = isReseller ? 0 : (config.UNTUNG_NOKOS || 0);

    if (global.lastCountryPhoto) {
        await bot.editMessageCaption(
            `⏳ *Mengambil detail operator…*`,
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "Markdown"
            }
        ).catch(()=>{});
    }

    try {
        let serviceName = "Layanan Tidak Dikenal";
        if (global.cachedServices) {
            const svc = global.cachedServices.find(s => String(s.service_code) === String(serviceId));
            if (svc) serviceName = svc.service_name;
        }

        let negara;
        if (global.cachedCountries && global.cachedCountries[serviceId]) {
            negara = global.cachedCountries[serviceId]
                .find(c => c.iso_code.toLowerCase() === isoCode.toLowerCase());
        }

        if (!negara) {
            const resNeg = await axios.get(
                `https://www.rumahotp.io/api/v2/countries?service_id=${serviceId}`,
                { headers: { "x-apikey": apiKey } }
            );
            negara = (resNeg.data?.data || [])
                .find(c => c.iso_code.toLowerCase() === isoCode.toLowerCase());
        }

        if (!negara) {
            return bot.editMessageCaption(
                `❌ Negara *${isoCode.toUpperCase()}* tidak ditemukan.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "Markdown"
                }
            );
        }

        const providerData = negara.pricelist
            .find(p => String(p.provider_id) === String(providerId));

        if (!providerData) {
            return bot.editMessageCaption(
                "❌ Provider tidak ditemukan untuk negara ini.",
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "Markdown"
                }
            );
        }

        const hargaFinal = (Number(providerData.price) || 0) + UNTUNG_NOKOS;
        const priceFormat = `Rp${hargaFinal.toLocaleString("id-ID")}`;

        const ops = await axios.get(
            `https://www.rumahotp.io/api/v2/operators?country=${encodeURIComponent(negara.name)}&provider_id=${providerId}`,
            { headers: { "x-apikey": apiKey } }
        );

        const operator = (ops.data?.data || [])
            .find(o => String(o.id) === String(operatorId));

        if (!operator) {
            return bot.editMessageCaption(
                "❌ Operator tidak ditemukan.",
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "Markdown"
                }
            );
        }

        const caption = `
📱 *KONFIRMASI PESAN NOMOR*
╭──────────────────────
│💠 Layanan: ${serviceName} (ID ${serviceId})
│🌍 Negara: ${negara.name} (${negara.iso_code.toUpperCase()})
│🏷️ Provider: ${providerId}
│📶 Operator: ${operator.name}
│💵 Harga: ${priceFormat}
│📦 Stok: ${providerData.stock}
╰──────────────────────
Tekan tombol di bawah untuk melanjutkan.
`;

        const inlineKeyboard = [
            [
                {
                    text: "✅ Pesan Nomor Ini",
                    callback_data: `confirm_${numberId}_${providerId}_${serviceId}_${operatorId}_${isoCode}`
                }
            ],
            [
                {
                    text: "⬅️ Kembali ke Operator",
                    callback_data: `operator_${numberId}_${providerId}_${serviceId}_${isoCode}`
                }
            ]
        ];

        await bot.editMessageMedia(
            {
                type: "photo",
                media: photoThumb,
                caption,
                parse_mode: "Markdown"
            },
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                reply_markup: { inline_keyboard: inlineKeyboard }
            }
        );

    } catch (err) {
        console.error("❌ ERROR chooseop:", err?.response?.data || err.message);

        await bot.editMessageCaption(
            "❌ *Gagal memuat detail operator.*",
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "Markdown"
            }
        );
    }
}
// =====================================================
// ✅ PROSES PESAN NOMOR — FIX: EDIT CAPTION LOADING (Tanpa Hapus Foto)
// =====================================================
if (data.startsWith("confirm_")) {
    const parts = data.split("_");
    const numberId = parts[1];
    const providerId = parts[2];
    const serviceId = parts[3];
    const operatorId = parts[4];
    const isoCode = parts[5];

    const fs = require("fs");
    const path = require("path");
    const axios = require("axios");
    const saldoPath = path.join(__dirname, "./database/saldoOtp.json");
    const apiKey = config.RUMAHOTP;

    const resellerPath = path.join(__dirname, "./database/reseller.json");
    let isReseller = false;
    try {
        if (fs.existsSync(resellerPath)) {
            const dbRes = JSON.parse(fs.readFileSync(resellerPath));
            isReseller = dbRes.some(u => u.id === from.id.toString());
        }
    } catch {}
    const UNTUNG_NOKOS = isReseller ? 0 : (config.UNTUNG_NOKOS || 0);

    let chatId = callbackQuery?.message?.chat?.id;
    if (!chatId) return;

    await bot.editMessageCaption(
        "⏳ *Memproses pesanan Anda...*",
        {
            chat_id: global.lastCountryPhoto.chatId,
            message_id: global.lastCountryPhoto.messageId,
            parse_mode: "Markdown"
        }
    ).catch(() => {});

    let userId = String(chatId);
    let saldoData = {};
    if (fs.existsSync(saldoPath)) saldoData = JSON.parse(fs.readFileSync(saldoPath));
    let userSaldo = saldoData[userId] || 0;

    let hargaDasar = 0;
    try {
        if (global.cachedCountries && global.cachedCountries[serviceId]) {
            const negaraCache = global.cachedCountries[serviceId].find(c => c.iso_code.toLowerCase() === isoCode.toLowerCase());
            const pData = negaraCache?.pricelist?.find(p => String(p.provider_id) === String(providerId));
            if (pData) hargaDasar = parseInt(pData.price || 0, 10) + UNTUNG_NOKOS;
        }
        if (hargaDasar === 0) {
            const resNeg = await axios.get(`https://www.rumahotp.io/api/v2/countries?service_id=${serviceId}`, { headers: { "x-apikey": apiKey } });
            const negara = (resNeg.data?.data || []).find(c => c.iso_code.toLowerCase() === isoCode.toLowerCase());
            const pData = negara?.pricelist?.find(p => String(p.provider_id) === String(providerId));
            hargaDasar = parseInt(pData?.price || 0, 10) + UNTUNG_NOKOS;
        }
    } catch { hargaDasar = 0; }

    const { finalPrice, discountAmount, code, percent } = applyDiscount(userId, hargaDasar);

    if (userSaldo < finalPrice) {
        return bot.editMessageCaption(
            `❌ *SALDO TIDAK CUKUP!*\n\n💰 Harga: Rp${hargaDasar.toLocaleString("id-ID")}\n📉 Diskon (${percent}%): -Rp${discountAmount.toLocaleString("id-ID")}\n💵 Bayar: Rp${finalPrice.toLocaleString("id-ID")}\n💳 Saldo: Rp${userSaldo.toLocaleString("id-ID")}`,
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "Markdown"
            }
        ).catch(() => {});
    }

    saldoData[userId] = userSaldo - finalPrice;
    fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

    if (code) useDiscount(userId);

    try {
        const resOrder = await axios.get(
            `https://www.rumahotp.io/api/v2/orders?number_id=${numberId}&provider_id=${providerId}&operator_id=${operatorId}`,
            { headers: { "x-apikey": apiKey } }
        );
        const dataOrder = resOrder.data?.data;
        
        if (!dataOrder) throw new Error("Gagal order API");

        const caption = `
✅ *PESANAN BERHASIL*
╭──────────────────────
│📱 Layanan: ${dataOrder.service}
│🌍 Negara: ${dataOrder.country}
│📞 Nomor: \`${dataOrder.phone_number}\`
│
│💰 Harga Awal: Rp${hargaDasar.toLocaleString("id-ID")}
│📉 Diskon ${percent}%: -Rp${discountAmount.toLocaleString("id-ID")}
│💵 Total Bayar: Rp${finalPrice.toLocaleString("id-ID")}
│💳 Sisa Saldo: Rp${saldoData[userId].toLocaleString("id-ID")}
╰──────────────────────
⏳ Expired: ${dataOrder.expires_in_minute} menit
`;
        const kb = [
            [{ text: "📩 Cek Kode SMS", callback_data: `checksms_${dataOrder.order_id}` }],
            [{ text: "❌ Batalkan", callback_data: `cancelorder_${dataOrder.order_id}` }]
        ];

        await bot.editMessageMedia(
            { type: "photo", media: config.ppthumb, caption, parse_mode: "Markdown" },
            { chat_id: global.lastCountryPhoto.chatId, message_id: global.lastCountryPhoto.messageId, reply_markup: { inline_keyboard: kb } }
        );

        if (!global.activeOrders) global.activeOrders = {};
        global.activeOrders[dataOrder.order_id] = {
            userId,
            messageId: global.lastCountryPhoto.messageId,
            hargaTotal: finalPrice, 
            createdAt: Date.now(),
            operator: dataOrder.operator
        };

    } catch (err) {
        saldoData[userId] += finalPrice;
        fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));
        await bot.editMessageCaption(`❌ *Gagal Order*\nSaldo telah dikembalikan.`, { chat_id: global.lastCountryPhoto.chatId, message_id: global.lastCountryPhoto.messageId, parse_mode: "Markdown" });
    }
}

// ==============================================
// ✅ CEK STATUS / KODE SMS — (CheckSMS Final v7 Sync RumahOTP)
// ==============================================
if (data.startsWith("checksms_")) {
  const orderId = data.split("_")[1];
  const axios = require("axios");
  const fs = require("fs");
  const apiKey = config.RUMAHOTP;
  const userId = from.id;
  const userName = from.first_name || "Anonymous";
  const username = from.username || "Anonymous";
  const ownerId = String(config.OWNER_ID);
  const channellog = config.idchannel;
  const nokosPath = "./database/nokosData.json";

  if (!global.activeOrders?.[orderId]) {
    return bot.sendMessage(chatId, `⚠️ Order ID \`${orderId}\` tidak ditemukan atau sudah dibatalkan.`, { parse_mode: "Markdown" });
  }

  const cachedOrder = global.activeOrders[orderId];
  const loadingMsg = await bot.sendMessage(chatId, "📡 Mengecek status SMS OTP...", { parse_mode: "Markdown" });

  try {
    const res = await axios.get(`https://www.rumahotp.io/api/v1/orders/get_status?order_id=${orderId}`, {
      headers: { "x-apikey": apiKey, Accept: "application/json" }
    });

    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    const d = res.data?.data;
    if (!d) return bot.sendMessage(chatId, "❌ Tidak ada data status dari server.");

    const otp = d.otp_code && d.otp_code !== "-" ? d.otp_code : "Belum masuk";

    // Kalau OTP belum masuk
    if (otp === "Belum masuk") {
      const statusText = `
📩 *STATUS TERBARU PESANAN*
╭──────────────────────
│📱 Layanan: ${d.service}
🌍 Negara: ${d.country}
│📶 Operator: ${cachedOrder.operator}
╰──────────────────────
│🆔 Order ID: \`${d.order_id}\`
│📞 Nomor: \`${d.phone_number}\`
│💰 Harga: Rp${cachedOrder.hargaTotal.toLocaleString("id-ID")}
│
│⏱️ Status: *${d.status}*
│🔐 SMS Code: \`${otp}\`
╰──────────────────────
Tekan tombol di bawah untuk refresh ulang.
`;
      return bot.sendMessage(chatId, statusText, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🔄 Cek Ulang OTP", callback_data: `checksms_${orderId}` }]] }
      });
    }

    // ✅ OTP SUDAH MASUK
    const now = new Date();
    const tanggal = now.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    const trxData = {
      customerName: userName,
      customerUsername: username,
      customerId: userId,
      service: d.service,
      country: d.country,
      operator: cachedOrder.operator,
      number: d.phone_number,
      otp: otp,
      price: `Rp${cachedOrder.hargaTotal.toLocaleString("id-ID")}`,
      orderId: d.order_id,
      date: tanggal
    };

    let db = [];
    if (fs.existsSync(nokosPath)) {
      try { db = JSON.parse(fs.readFileSync(nokosPath, "utf-8")); } catch { db = []; }
    }
    db.push(trxData);
    fs.writeFileSync(nokosPath, JSON.stringify(db, null, 2));

    try { await bot.deleteMessage(chatId, cachedOrder.messageId); } catch {}
    delete global.activeOrders[orderId];

// ========================
// 🎁 BONUS POINT +50 SAAT OTP MASUK — FORMAT BARU
// ========================
try {
  const pointPath = "./database/pointSaldo.json";
  let pointDb = {};

  if (fs.existsSync(pointPath)) {
    try {
      pointDb = JSON.parse(fs.readFileSync(pointPath, "utf-8"));
    } catch {
      pointDb = {};
    }
  }

  // Jika user belum ada → buat struktur default
  if (!pointDb[userId]) {
    pointDb[userId] = {
      point_total: 0,
      convert_total: 0,
      history: []
    };
  }

  // Tambah point
  pointDb[userId].point_total += 50;

  // Tambah ke history
  pointDb[userId].history.push({
    tipe: "Bonus Point",
    jumlah: 50,
    tanggal: new Date().toISOString(),
    keterangan: "Bonus Point Karena Sudah Mendapat OTP masuk"
  });

  // Simpan
  fs.writeFileSync(pointPath, JSON.stringify(pointDb, null, 2));

  // Notif ke user
  await bot.sendMessage(
    chatId,
    `🎁 *Bonus Point +50!*\n\nTotal poin kamu sekarang: *${pointDb[userId].point_total}*`,
    { parse_mode: "Markdown" }
  );

} catch (err) {
  console.error("Gagal menambah point:", err.message);
}

    const notifText = `
🎉 *TRANSAKSI BERHASIL!* 🎉
╭──────────────────────
│📱 *Layanan:* ${trxData.service}
│🌍 *Negara:* ${trxData.country}
│📶 *Operator:* ${trxData.operator}
╰──────────────────────
│🆔 *Order ID:* \`${trxData.orderId}\`
│📞 *Nomor:* \`${trxData.number}\`
│💰 *Harga:* ${trxData.price}
╭──────────────────────
│⏱️ *Status:* Success
│🔐 *SMS Code:* \`${trxData.otp}\`
╰──────────────────────
🎯 *OTP berhasil dikirim ke user Transaksi di anggap done selesai!✅*
Terima kasih telah menggunakan layanan kami.
`;

    await bot.sendMessage(chatId, notifText, { parse_mode: "Markdown" });

// ========================
// ⭐ MUNCULKAN RATING
// ========================
await bot.sendMessage(chatId,
"⭐ *Beri Rating Layanan Ini*\n\nSilakan pilih rating 0–5:",
{
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [
        { text: "0 ⭐", callback_data: `rate_${orderId}_0` }
      ],
      [
        { text: "1 ⭐", callback_data: `rate_${orderId}_1` }
      ],      
      [
        { text: "2 ⭐", callback_data: `rate_${orderId}_2` }
      ],      
      [
        { text: "3 ⭐", callback_data: `rate_${orderId}_3` }
      ],      
      [
        { text: "4 ⭐", callback_data: `rate_${orderId}_4` }
      ],      
      [
        { text: "5 ⭐", callback_data: `rate_${orderId}_5` }
      ]
    ]
  }
});
// ======================
// 📢 NOTIF KE CHANNEL & OWNER (FINAL FIX)
// ======================

// Kirim ke owner (full detail)
if (ownerId) {
  await bot.sendMessage(ownerId, `
🔔 *Transaksi Baru:*

🎉 *TRANSAKSI BERHASIL!* 🎉
╭──────────────────────
│📱 *Layanan:* ${trxData.service}
│🌍 *Negara:* ${trxData.country}
│📶 *Operator:* ${trxData.operator}
╰─────────────────────
│🆔 *Order ID:* \`${trxData.orderId}\`
│📞 *Nomor:* \`${trxData.number}\`
│🔐 *Kode OTP:* \`${trxData.otp}\`
│💰 *Harga:* ${trxData.price}
╰──────────────────────
│📆 *Tanggal:* ${trxData.date}
╰──────────────────────
🟢 *Status:* OTP berhasil dikirim ke User & transaksi dianggap done karena otp selesai diterima.
╰─────────────────────
╭── 👤 *Pembeli:*  
│ • Nama: ${userName}  
│ • Username: @${username}  
│ • ID Telegram: \`${userId}\`
╰──────────────────────
⚠️ Syarat & Ketentuan:

1. OTP yang sudah diterbitkan tidak dapat direfund.
2. Gunakan nomor segera untuk menghindari expired.
3. Bot tidak bertanggung jawab atas penyalahgunaan akun.
🔄 Sistem Auto 24/7 By Order OTP
╭──────────────────────
│🤖 *Sistem Auto 24/7*  
│✅ Proses cepat & aman
│✅ Panel smm proses kilat
│✅ SMS langsung masuk  
│✅ Refund otomatis jika gagal
╰──────────────────────
✍️ Terima kasih Telah menggunakan Layanan kami dan Kalau jika ada kendala, Silahkan hubungi support admin kapan saja📞🤝
🙏 Terima kasih atas pembelian anda dan kepercayaan Kepada kami resmi 💯% untuk bukti testi transaksi join sekarang @manzzyidnokos juga order di Manzzy ID!
`, { parse_mode: "Markdown" }).catch(() => {});
}

// ======================
// MASKING UNTUK CHANNEL
// ======================
if (channellog && channellog !== "" && channellog !== "0") {

  const number = trxData.number || "";
  const cleanNumber = number.replace(/\D/g, "");
  const phoneMasked =
    cleanNumber.length > 4
      ? `${cleanNumber.slice(0, 2)}*******${cleanNumber.slice(-2)}`
      : `${cleanNumber.slice(0, 1)}***`;

  const otp = trxData.otp || "";
  const cleanOtp = otp.replace(/\D/g, "");
  const otpMasked =
    cleanOtp.length > 3
      ? `${cleanOtp.slice(0, 2)}***${cleanOtp.slice(-1)}`
      : `***`;

  const chNotif = `
📢 *TRANSAKSI TELAH BERHASIL*
╭──────────────────────
│📱 *Layanan:* ${trxData.service}
│🌍 *Negara:* ${trxData.country}
│📶 *Operator:* ${trxData.operator}
╰──────────────────────
│🆔 *Order ID:* ${trxData.orderId}
│📞 *Nomor:* \`+${phoneMasked}\`
│🔐 *Kode OTP:* \`${otpMasked}\`
│💰 *Harga:* ${trxData.price}
╰──────────────────────
│📆 *Tanggal:* ${trxData.date}
╰──────────────────────
🟢 *Status:* OTP berhasil dikirim ke User & transaksi dianggap done karena otp selesai diterima.
╰──────────────────────
╭─ 👤 *Pembeli:*  
│ • Nama: ${userName}  
│ • Username: @${username}  
│ • ID Telegram: \`${userId}\`
╰──────────────────────
⚠️ Syarat & Ketentuan:

1. OTP yang sudah diterbitkan tidak dapat direfund
2. Gunakan nomor segera untuk menghindari expired.
3. Bot tidak bertanggung jawab atas penyalahgunaan akun.
🔄 Sistem Auto 24/7 By Order OTP
╭──────────────────────
│🤖 *Sistem Auto 24/7*  
│✅ Proses cepat & aman
│✅ Panel smm proses kilat 
│✅ SMS langsung masuk  
│✅ Refund otomatis jika gagal
╰──────────────────────
✍️ Terima kasih Telah menggunakan Layanan kami dan Kalau jika ada kendala, Silahkan hubungi support admin kapan saja📞🤝
🙏 Terima kasih atas pembelian anda dan kepercayaan Kepada kami resmi 💯% untuk bukti testi transaksi join sekarang @manzzyidnokos juga order di Manzzy ID!
`;

  // Kirim ke channel — anti error
  await bot.sendMessage(channellog, chNotif, { parse_mode: "Markdown" })
    .catch(err => console.error("Gagal kirim ke channel:", err.message));
}
  } catch (err) {
    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    console.error("❌ Error cek OTP:", err?.response?.data || err.message);
    await bot.sendMessage(chatId, "❌ Terjadi kesalahan saat cek OTP.", { parse_mode: "Markdown" });
  }
}
// ==============================================
// ⭐ HANDLE PILIH RATING
// ==============================================
if (data.startsWith("rate_")) {
  const parts = data.split("_");
  const orderId = parts[1];
  const rating = parseInt(parts[2]);

  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id.toString();

  // Simpan rating sementara
  if (!global.tempRating) global.tempRating = {};
  global.tempRating[userId] = { orderId, rating };

await bot.editMessageText(
  `⭐ *Rating Anda:* ${rating} / 5\n\n✍️ Sekarang tulis *ulasan* Anda.`,
  {
    chat_id: chatId,
    message_id: callbackQuery.message.message_id,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Lanjut Tanpa Ulasan ➡️", callback_data: `rate_skip_${orderId}` }]
      ]
    }
  }
);

// simpan message_id supaya bisa dihapus setelah ulasan diterima
if (!global.tempRating) global.tempRating = {};
global.tempRating[userId] = {
  orderId,
  rating,
  messageId: callbackQuery.message.message_id
};
}
// ==============================================
// ⏭️ SKIP ULASAN
// ==============================================
if (data.startsWith("rate_skip_")) {
  const orderId = data.split("_")[2];
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id.toString();
  const channellog = config.idchannel;

  const ratingData = global.tempRating?.[userId];
  if (!ratingData) return;

  delete global.tempRating[userId];

  const rateFile = "./database/ratingNokos.json";

  const finalData = {
    userId,
    userName: callbackQuery.from.first_name,
    username: callbackQuery.from.username || "-",
    orderId,
    rating: ratingData.rating,
    review: "-",
    date: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
  };

  let list = [];
  if (fs.existsSync(rateFile)) {
    try { list = JSON.parse(fs.readFileSync(rateFile, "utf-8")); } catch {}
  }
  list.push(finalData);
  fs.writeFileSync(rateFile, JSON.stringify(list, null, 2));

  await bot.editMessageText(
    `⭐ *Rating tersimpan ${finalData.rating}/5!*\nTerima kasih sudah menilai layanan kami.`,
    {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id,
      parse_mode: "Markdown"
    }
  );

  // ================================
  // 🔊 KIRIM KE CHANNEL (RATING SAJA)
  // ================================
  if (channellog && channellog !== "0") {
    const chTxt = `
⭐ *Rating Baru Masuk*
╭──────────────────────
│🆔 *Order ID:* \`${finalData.orderId}\`
│⭐ *Rating:* ${finalData.rating}/5
│💬 Ulasan: _Tidak ada (skip)_
╰──────────────────────
│👤 *User:*
│• Nama: ${finalData.userName}
│• ID Telegram: \`${finalData.userId}\`
│• Username: @${finalData.username}
╰──────────────────────
│📆 *Tanggal:* ${finalData.date}
`;

    bot.sendMessage(channellog, chTxt, { parse_mode: "Markdown" })
      .catch((e) => console.error("Gagal kirim rating ke channel:", e.message));
  }
}
// ==============================================
// ❌ BATALKAN PESANAN + REFUND + WAKTU REALTIME — V12.1 FINAL FIX
// ==============================================
if (data.startsWith("cancelorder_")) {
  const orderId = data.split("_")[1];
  const axios = require("axios");
  const fs = require("fs");
  const path = require("path");

  const apiKey = config.RUMAHOTP;
  const saldoPath = path.join(__dirname, "./database/saldoOtp.json");

  const orderInfo = global.activeOrders?.[orderId];
  if (!orderInfo) {
    return bot.sendMessage(
      chatId,
      "⚠️ *Data pesanan tidak ditemukan atau sudah kadaluarsa.*",
      { parse_mode: "Markdown" }
    );
  }

  const cooldown = 5 * 60 * 1000; // 5 menit
  const cancelableAt = orderInfo.createdAt + cooldown;
  const now = Date.now();

  // 🔹 Tunda pembatalan kalau belum 5 menit
  if (now < cancelableAt) {
    // 💡 Format waktu realtime Indonesia (WIB)
    const waktuBisaCancel = new Date(cancelableAt)
      .toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      .replace(/\./g, ":");

    return bot.sendMessage(
      chatId,
      `❌ Anda belum bisa membatalkan pesanan ini.\n\n🆔 *Order ID:* \`${orderId}\`\n🕒 *Waktu Pembatalan:* ${waktuBisaCancel}\n\nSilakan tunggu hingga waktu di atas.`,
      { parse_mode: "Markdown" }
    );
  }

  // 🔹 Kirim pesan loading
  const loadingMsg = await bot.sendMessage(chatId, "🗑️ Membatalkan pesanan...", {
    parse_mode: "Markdown",
  });

  try {
    // 🔹 Batalkan pesanan di server RumahOTP
    const response = await axios.get(
      `https://www.rumahotp.io/api/v1/orders/set_status?order_id=${orderId}&status=cancel`,
      { headers: { "x-apikey": apiKey, Accept: "application/json" } }
    );

    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

    if (response.data?.success) {
      // ✅ Hapus pesan order utama
      if (orderInfo.messageId) {
        await bot.deleteMessage(chatId, orderInfo.messageId).catch(() => {});
      }

      // ✅ Baca saldo & refund otomatis
      let saldoData = {};
      if (fs.existsSync(saldoPath)) {
        saldoData = JSON.parse(fs.readFileSync(saldoPath));
      }

      const userId = orderInfo.userId;
      saldoData[userId] = (saldoData[userId] || 0) + orderInfo.hargaTotal;
      fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

      const saldoFormatted = `Rp${saldoData[userId].toLocaleString("id-ID")}`;
      const refundFormatted = `Rp${orderInfo.hargaTotal.toLocaleString("id-ID")}`;

      await bot.sendMessage(
        chatId,
        `✅ *Pesanan Berhasil Dibatalkan!*\n\n🆔 *Order ID:* \`${orderId}\`\n💸 *Refund:* ${refundFormatted}\n💰 *Saldo Terbaru:* ${saldoFormatted}\n\nPesanan telah dibatalkan & saldo otomatis dikembalikan.`,
        { parse_mode: "Markdown" }
      );

      delete global.activeOrders[orderId];
    } else {
      await bot.sendMessage(
        chatId,
        `❌ *Gagal membatalkan pesanan!*\n🧩 ${response.data?.message || "Tidak ada pesan dari API."}`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (err) {
    console.error("❌ Error cancelorder:", err?.response?.data || err.message);
    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId, "❌ Terjadi kesalahan saat membatalkan pesanan.", {
      parse_mode: "Markdown",
    });
  }
}
// ===============================
// 👤 PROFILE MENU (Owner + User)
// ===============================
if (data === "profile") {
  await bot.answerCallbackQuery(callbackQuery.id, { text: "👤 Membuka profil Anda..." });

  const fs = require("fs");
  const saldoFile = "./database/saldoOtp.json";
  const apiKey = config.RUMAHOTP; // ✅ Ambil API key langsung dari config.js

  let saldoUser = 0;
  let name = from.first_name || "Tanpa Nama";
  let username = from.username ? `@${from.username}` : "Tidak ada username";
  let saldoApi = null;
  let saldoApiFormat = null;
  let apiStatus = "✅ Berhasil";

  // 🔰 Jika OWNER utama → ambil saldo dari API RumahOTP
  if (String(userId) === String(config.OWNER_ID)) {
    try {
      const response = await axios.get("https://www.rumahotp.io/api/v1/user/balance", {
        headers: {
          "x-apikey": apiKey,
          Accept: "application/json",
        },
        timeout: 20000,
      });

      if (response.data.success && response.data.data) {
        const info = response.data.data;
        saldoApi = info.balance || 0;
        saldoApiFormat = info.formated || `Rp ${saldoApi.toLocaleString("id-ID")}`;
        name = `${info.first_name} ${info.last_name}`.trim() || name;
        username = info.username ? `@${info.username}` : username;
      } else {
        apiStatus = "⚠️ Gagal (Data kosong)";
      }
    } catch (err) {
      console.error("❌ Gagal ambil saldo API:", err.message);
      apiStatus = "❌ Gagal koneksi API";
    }
  }

  // 👥 Semua user (termasuk owner) → ambil dari saldoOtp.json juga
  if (fs.existsSync(saldoFile)) {
    try {
      const saldoData = JSON.parse(fs.readFileSync(saldoFile));
      saldoUser = saldoData[userId] || 0;
    } catch (err) {
      console.error("Gagal baca saldoOtp.json:", err);
    }
  }

  // Format tampilan saldo
  const saldoLocalFormat = saldoUser.toLocaleString("id-ID");

// ============================
  // 🧾 TEMPLATE PROFIL BARU
  // ============================
  const moment = require("moment-timezone");
  const joinDateFile = "./database/joinDate.json";

  // Simpan tanggal join jika belum ada
  let joinDate = null;
  if (!fs.existsSync(joinDateFile)) {
    fs.writeFileSync(joinDateFile, "{}");
  }

  const joinData = JSON.parse(fs.readFileSync(joinDateFile));

  if (!joinData[userId]) {
    joinData[userId] = moment().tz("Asia/Jakarta").format("DD/MM/YYYY HH.mm.ss");
    fs.writeFileSync(joinDateFile, JSON.stringify(joinData, null, 2));
  }

  joinDate = joinData[userId];
  
  // ===============================
// 🔢 HITUNG TOTAL DEPOSIT USER
// ===============================
const depositPath = "./database/deposit.json";
let totalDeposit = 0;

if (fs.existsSync(depositPath)) {
  try {
    const depositData = JSON.parse(fs.readFileSync(depositPath));

    // ambil deposit milik user
    const userDeposits = depositData.filter(
      (d) => String(d.userId) === String(userId)
    );

    // jumlahkan semua total deposit sukses
    totalDeposit = userDeposits
      .filter((d) => d.status && d.status.toLowerCase().includes("success"))
      .reduce((acc, cur) => acc + (parseInt(cur.total) || 0), 0);

  } catch (err) {
    console.error("❌ Error baca deposit.json:", err);
  }
}

// ===============================
// 🛒 HITUNG TOTAL ORDER USER
// ===============================
const orderPath = "./database/nokosData.json";
let totalOrder = 0;

if (fs.existsSync(orderPath)) {
  try {
    let orderRaw = JSON.parse(fs.readFileSync(orderPath, "utf8"));

    // pastikan dalam bentuk array
    if (!Array.isArray(orderRaw)) {
      orderRaw = [orderRaw];
    }

    // hitung order milik user
    const userOrders = orderRaw.filter(
      (item) => String(item.customerId) === String(userId)
    );

    totalOrder = userOrders.length;

  } catch (err) {
    console.error("❌ Error baca nokosData.json:", err);
  }
}

  // Hitung panjang digit User ID
const idDigit = String(userId).length;
const idDisplay = `(${idDigit} Digit)`;

  const nowTime = moment().tz("Asia/Jakarta").format("HH.mm.ss, DD/MM/YYYY");

// ===============================
// 🎯 CEK POINT USER (FORMAT BARU)
// ===============================
const pointPath = "./database/pointSaldo.json";
let userPoint = 0;

if (fs.existsSync(pointPath)) {
  try {
    const pointRaw = JSON.parse(fs.readFileSync(pointPath, "utf8"));
    
    if (pointRaw[userId]) {
      userPoint = pointRaw[userId].point_total || 0;
    }

  } catch (err) {
    console.error("❌ Error baca pointSaldo.json:", err);
  }
}

  // ============================
  // 📄 FORMAT PROFIL BARU
  // ============================
  let caption = `
╔ 🌟 *P R O F I L  A N D A* 🌟 ╗
│
│    👤 Name: *${name}*  
${username !== "Tidak ada username" ? `   │   🏷️ Username: *${username}*` : ""}
╰────────────────────────
│📌 *IDENTITAS PENGGUNA*
│• 🆔 ID Telegram: \`${userId}\` ${idDisplay}
│• 🛡️ Status Akun: 🟢 Online  
│• 🎖️ Level: *BASIC MEMBER*
╰────────────────────────
│💰 *SALDO & RIWAYAT*
│• 💵 Saldo Saat Ini: *Rp ${saldoLocalFormat}*
│• 💳 Total Deposit: *Rp ${totalDeposit.toLocaleString("id-ID")}*
│• 🛍️ Total Order: *${totalOrder} Pesanan*
│• 🪙 Point Saat Ini: *${userPoint} Point*
╰───────────────────────
│⏳ *AKTIVITAS WAKTU*
│• 📅 Bergabung: *${joinDate}*
│• 🕒 Sekarang: *${nowTime}*
╰────────────────────────

👨‍💻 *Developer:* ${config.authorName}
`.trim();

  const options = {
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛍️ TopUp Saldo ", callback_data: "topup_nokos" }],      
        [{ text: "📱 Menu Utama", callback_data: "back_home" }],
      ],
    },
  };

  await bot.editMessageCaption(caption, {
    chat_id: chatId,
    message_id: message.message_id,
    ...options,
  });

  return;
}

// ===============================  
// 💰 RIWAYAT DEPOSIT USER (MAX 10 DATA)  
// ===============================  
if (data === "riwayat_deposit") {
  const fs = require("fs");
  const pathDeposit = "./database/deposit.json";
  const pathSaldo = "./database/saldoOtp.json";

  const username = from.username ? `@${from.username}` : "Tidak ada username";
  const name = from.first_name || "Tanpa Nama";
  const userId = from.id.toString();

  // Pastikan file ada
  if (!fs.existsSync(pathDeposit)) fs.writeFileSync(pathDeposit, JSON.stringify([]));
  if (!fs.existsSync(pathSaldo)) fs.writeFileSync(pathSaldo, JSON.stringify({}));

  const depositData = JSON.parse(fs.readFileSync(pathDeposit));
  const saldoData = JSON.parse(fs.readFileSync(pathSaldo));

  // ✅ Filter deposit sesuai user
  const userDeposits = depositData.filter(d => d.userId.toString() === userId);

  // ===============================
  // 💾 BATAS 10 RIWAYAT PER USER
  // ===============================
  if (userDeposits.length > 10) {
    // hapus data lama jika lebih dari 10
    const userLatest10 = userDeposits.slice(-10);
    // hapus semua data lama user dari database
    const newData = depositData.filter(d => d.userId.toString() !== userId);
    // gabungkan 10 data terakhir user dengan data user lain
    const finalData = [...newData, ...userLatest10];
    fs.writeFileSync(pathDeposit, JSON.stringify(finalData, null, 2));
  }

  // Ambil ulang data deposit setelah filter
  const updatedDeposits = JSON.parse(fs.readFileSync(pathDeposit));
  const userDepositsUpdated = updatedDeposits.filter(d => d.userId.toString() === userId);

  let caption = `📊 *Riwayat Deposit*\n\n`;

  if (userDepositsUpdated.length === 0) {
    caption += `Kamu belum pernah melakukan deposit.\n\n`;
  } else {
    const lastDeposits = userDepositsUpdated.slice(-10).reverse(); // 10 terakhir, terbaru di atas
    caption += `💰 *Deposit Terakhir:*\n`;
    for (const dep of lastDeposits) {
      let totalFormatted;
      if (dep.total === "-" || dep.total === "" || dep.total === null) {
        totalFormatted = "-";
      } else {
        totalFormatted = parseInt(dep.total).toLocaleString("id-ID");
      }

      const status = dep.status.toLowerCase().includes("success")
        ? "✅Berhasil"
        : "❌Cancelled";

      caption += `• Rp${totalFormatted} - ${status}\n`;
    }
    caption += `\n`;
  }

  const saldoUser = saldoData[userId] || 0;
  caption += `📄 *Saldo Saat Ini:* Rp${saldoUser.toLocaleString("id-ID")}`;

  const options = {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "⬅️ Kembali", callback_data: "profile" }],
        [{ text: "📱 Menu Utama", callback_data: "back_home" }],
      ],
    },
  };

  try {
    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: message.message_id,
      ...options,
    });
  } catch {
    await bot.sendMessage(chatId, caption, options);
  }

  return bot.answerCallbackQuery(callbackQuery.id);
}
// ===============================  
// 💰 RIWAYAT ORDER USER (MAX 5 DATA)  
// ===============================  
  // 📜 Jika user klik tombol history order
  if (data === "history_orderbot") {
    const filePath = "./database/nokosData.json";
    if (!fs.existsSync(filePath)) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: "Belum ada riwayat order.", show_alert: true });
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, "utf8"));
    // Filter order berdasarkan ID user
    const userOrders = rawData.filter((item) => item.customerId === userId);

    if (userOrders.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: "Kamu belum pernah melakukan order.", show_alert: true });
    }

    // Tampilkan halaman pertama
    showOrderPage(chatId, messageId, userOrders, 1, callbackQuery.id);
  }

  // 📄 Pagination handler (misal: page_2)
  if (data.startsWith("page_")) {
    const page = parseInt(data.split("_")[1]);
const filePath = "./database/nokosData.json";
let rawData = JSON.parse(fs.readFileSync(filePath, "utf8"));

// Pastikan dalam bentuk array
if (!Array.isArray(rawData)) {
  rawData = [rawData];
}

const userOrders = rawData.filter((item) => item.customerId === userId);

    showOrderPage(chatId, messageId, userOrders, page, callbackQuery.id);
  }
async function showOrderPage(chatId, messageId, userOrders, page, callbackId) {
  try {
    const perPage = 5;
    const totalPages = Math.ceil(userOrders.length / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pageData = userOrders.slice(start, end);

    let caption = `📦 *RIWAYAT ORDER KAMU*\n`;
    caption += `📄 Halaman *${page}* dari *${totalPages}*\n`;
    caption += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Jika tidak ada data
    if (pageData.length === 0) {
      caption += `Kamu belum memiliki order.\n\n`;
    }

    pageData.forEach((order, i) => {
      caption += `*${start + i + 1}. ${order.service}*  \`#${order.orderId}\`\n`;
      caption += `┌ 🌍 Negara: *${order.country}*\n`;
      caption += `├ 📞 Nomor: \`${order.number}\`\n`;
      caption += `├ 💰 Harga: *${order.price}*\n`;
      caption += `├ 💬 OTP: ${order.otp ? "`" + order.otp + "`" : "_Belum ada_"}\n`;
      caption += `└ 🗓️ Tanggal: ${order.date}\n\n`;
    });

    caption += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    caption += `📌 Total Order: *${userOrders.length}*\n`;

    const buttons = [];
    if (page > 1) buttons.push({ text: "⬅️ Sebelumnya", callback_data: `page_${page - 1}` });
    if (page < totalPages) buttons.push({ text: "Berikutnya ➡️", callback_data: `page_${page + 1}` });

    // Keyboard Pagination + Home
    const keyboard = [
      buttons,
      [{ text: "🏠 Menu Utama", callback_data: "back_home" }],
    ].filter(row => row.length);

    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });

    if (callbackId) bot.answerCallbackQuery(callbackId);

  } catch (err) {
    console.error("❌ Error showOrderPage:", err);
    bot.answerCallbackQuery(callbackId, {
      text: "Terjadi kesalahan saat menampilkan riwayat.",
      show_alert: true,
    });
  }
}
// =====================================================
// 🏆 LIST TOP USER MENU (TOP ORDER / TOP DEPOSIT / TOP SALDO / TOP POINT)
// =====================================================
if (data === "listtop_user") {
  return bot.editMessageCaption(
`🏆 *L I S T  —  T O P  U S E R S*

╔══════════════════════════════╗
║   🌟 *Pilih Kategori Top User* 🌟   ║
╠══════════════════════════════╣
║ 🛒 *Top Order*  
║    Pengguna dengan order terbanyak
║
║ 💰 *Top Deposit*  
║    Pengguna dengan total deposit tertinggi
║
║ 💳 *Top Saldo*  
║    Pengguna dengan saldo terbesar
║
║ ⭐ *Top Point*
║    Pengguna dengan point terbanyak
╠══════════════════════════════╣
║ 🔄 *Data realtime & akurat*
╚══════════════════════════════╝

👨‍💻 *Developer:* ${config.authorName}
`,
    {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🛒 Top Order", callback_data: "top_order" },
          ],
          [
            { text: "💰 Top Deposit", callback_data: "top_depo" },
          ],
          [
            { text: "💳 Top Saldo", callback_data: "top_saldo" },
          ],
          [
            { text: "⭐ Top Point", callback_data: "top_point" },
          ],
          [
            { text: "⬅️ Kembali", callback_data: "back_home" },
          ],
        ],
      },
    }
  );
}
// ===============================
// ⭐ TOP POINT (10 USER POINT TERBANYAK)
// ===============================
if (data === "top_point") {
  try {
    const fs = require("fs");
    const pointPath = "./database/pointSaldo.json";

    // Cek file
    if (!fs.existsSync(pointPath)) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Data point tidak ditemukan!",
        show_alert: true,
      });
    }

    // Load JSON
    let pointDb = {};
    try {
      pointDb = JSON.parse(fs.readFileSync(pointPath, "utf8"));
    } catch (e) {
      console.log("JSON ERROR POINT:", e);
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Format JSON rusak!",
        show_alert: true,
      });
    }

    const users = Object.entries(pointDb);

    if (users.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Belum ada user yang memiliki point!",
        show_alert: true,
      });
    }

    // ==========================
    // URUTKAN USER BY POINT
    // ==========================
    const ranking = users
      .map(([uid, data]) => ({
        userId: uid,
        point: data.point_total || 0,
      }))
      .sort((a, b) => b.point - a.point) // terbesar → kecil
      .slice(0, 10);

    // ==========================
    // SUSUN TEKS
    // ==========================
    let text = `⭐ *TOP 10 USER DENGAN POINT TERBANYAK*\n\n`;

    ranking.forEach((u, i) => {
      text += `*${i + 1}.* [User](tg://user?id=${u.userId})\n`;
      text += `🆔 ID: \`${u.userId}\`\n`;
      text += `⭐ Point: *${u.point}*\n\n`;
    });

    // Tombol kembali
    const options = {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Kembali", callback_data: "listtop_user" }]
        ],
      },
    };

    await bot.editMessageCaption(text, {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      ...options,
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.log("ERR TOP POINT:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan saat memuat Top Point.",
      show_alert: true,
    });
  }
}
// ===============================
// 🛒 TOP ORDER (10 USER ORDER TERBANYAK)
// ===============================
if (data === "top_order") {
  try {
    const fs = require("fs");

    const path = "./database/nokosData.json";

    // 🔍 Cek file
    if (!fs.existsSync(path)) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Data order tidak ditemukan!",
        show_alert: true,
      });
    }

    // 🔍 Baca JSON
    let raw = fs.readFileSync(path, "utf8");
    let orders = [];

    try {
      orders = JSON.parse(raw);
      if (!Array.isArray(orders)) throw new Error("Format bukan array");
    } catch (e) {
      console.log("JSON ERROR:", e);
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Format JSON rusak!",
        show_alert: true,
      });
    }

    if (orders.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Belum ada data order!",
        show_alert: true,
      });
    }

    // ==========================
    // HITUNG ORDER PER USER
    // ==========================
    const count = {}; 
    const nameMap = {};

    for (const o of orders) {
      const uid = String(o.customerId);
      nameMap[uid] = o.customerName || "Tidak diketahui";

      if (!count[uid]) count[uid] = 0;
      count[uid]++;
    }

    // Convert to array → sort → ambil top 10
    const ranking = Object.entries(count)
      .sort((a, b) => b[1] - a[1]) // terbanyak
      .slice(0, 10);

    // ==========================
    // SUSUN TEKS
    // ==========================
    let text = `💳 *TOP 10 USER ORDER TERBANYAK*\n\n`;

    ranking.forEach((u, i) => {
      const userId = u[0];
      const totalOrder = u[1];
      const namaUser = nameMap[userId] || "Tidak diketahui";

      text += `*${i + 1}.* [${namaUser}](tg://user?id=${userId})\n`;
      text += `🆔 ID: \`${userId}\`\n`;
      text += `🛒 Order: *${totalOrder}x*\n\n`;
    });

    // Tombol kembali
    const options = {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Kembali", callback_data: "listtop_user" }]
        ],
      },
    };

    await bot.editMessageCaption(text, {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      ...options,
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.log("ERR TOP ORDER:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan saat memuat Top Order.",
      show_alert: true,
    });
  }
}
// ===============================
// 💰 TOP DEPOSIT (10 USER DEPOSIT TERBANYAK)
// ===============================
if (data === "top_depo") {
  try {
    const fs = require("fs");

    const path = "./database/deposit.json";

    // 🔍 Cek file ada
    if (!fs.existsSync(path)) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Data deposit tidak ditemukan!",
        show_alert: true,
      });
    }

    // 🔍 Baca file JSON
    let raw = fs.readFileSync(path, "utf8");
    let depo = [];

    try {
      depo = JSON.parse(raw);
      if (!Array.isArray(depo)) throw new Error("Data bukan array");
    } catch (e) {
      console.log("JSON ERROR:", e);
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Format JSON rusak!",
        show_alert: true,
      });
    }

    if (depo.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Belum ada data deposit!",
        show_alert: true,
      });
    }

    // 🔄 Hitung total deposit per user (SUCCESS ONLY)
    const map = {}; // key = userId

    for (let d of depo) {
      if (!d.userId) continue;
      if (d.status !== "success") continue;
      if (isNaN(d.total)) continue; // skip "-", null, dll

      const amount = Number(d.total);

      if (!map[d.userId]) {
        map[d.userId] = {
          userId: d.userId,
          username: d.username || "-",
          totalDepo: 0,
        };
      }

      map[d.userId].totalDepo += amount;
    }

    // Jika semua data tidak valid / 0
    const arr = Object.values(map);
    if (arr.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Belum ada deposit berhasil!",
        show_alert: true,
      });
    }

    // 🔽 Urutkan dari deposit terbesar
    const ranking = arr.sort((a, b) => b.totalDepo - a.totalDepo).slice(0, 10);

// 📝 Buat list text  
let text = `💰 *TOP 10 USER DEPOSIT TERBANYAK*\n\n`;  

ranking.forEach((u, i) => {

  const clickable = u.username && u.username !== "-" 
    ? `(@${u.username})`
    : "(tanpa username)";

  text += `*${i + 1}. ${u.username || "NoName"}* ${clickable}\n`;
  text += `🆔 ID: \`${u.userId}\`\n`;
  text += `💵 Total Deposit: *Rp${u.totalDepo.toLocaleString()}*\n\n`;
});

    // 🔘 Tombol kembali
    const options = {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "listtop_user" }]],
      },
    };

    // Kirim hasil
    await bot.editMessageCaption(text, {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      ...options,
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.log("ERR TOP DEPOSIT:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan saat memuat Top Deposit.",
      show_alert: true,
    });
  }
}
// ===============================
// 💳 TOP SALDO (10 USER SALDO TERBANYAK)
// ===============================
if (data === "top_saldo") {
  try {
    const fs = require("fs");

    const path = "./database/saldoOtp.json";

    // 🔍 Cek file
    if (!fs.existsSync(path)) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Data saldo tidak ditemukan!",
        show_alert: true,
      });
    }

    // 🔍 Baca file JSON
    let raw = fs.readFileSync(path, "utf8");
    let saldo = {};

    try {
      saldo = JSON.parse(raw);
      if (typeof saldo !== "object") throw new Error("Format bukan object");
    } catch (e) {
      console.log("JSON ERROR:", e);
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Format JSON rusak!",
        show_alert: true,
      });
    }

    const entries = Object.entries(saldo); // [ [userId, saldo], ... ]

    if (entries.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Belum ada data saldo!",
        show_alert: true,
      });
    }

    // 🔽 Urutkan saldo terbanyak → ambil 10
    const ranking = entries
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 10);

    // 📝 Susun teks
    let text = `💳 *TOP 10 USER SALDO TERBANYAK*\n\n`;

    // 🔍 Ambil nama user dengan getChat (jika bisa)
    for (let i = 0; i < ranking.length; i++) {
      const userId = ranking[i][0];
      const userSaldo = Number(ranking[i][1]);

      let namaUser = "Tidak diketahui";

      try {
        const info = await bot.getChat(userId);
        if (info.first_name || info.last_name) {
          namaUser = `${info.first_name || ""} ${info.last_name || ""}`.trim();
        } else if (info.username) {
          namaUser = `@${info.username}`;
        }
      } catch (e) {
        // bot belum pernah chat ketemu user → fallback
      }

      text += `*${i + 1}.* [${namaUser}](tg://user?id=${userId})\n`;
      text += `🆔 ID: \`${userId}\`\n`;
      text += `💰 Saldo: *Rp${userSaldo.toLocaleString()}*\n\n`;
    }

    // 🔘 Tombol kembali
    const options = {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Kembali", callback_data: "listtop_user" }]
        ],
      },
    };

    // Kirim hasil
    await bot.editMessageCaption(text, {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      ...options,
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.log("ERR TOP SALDO:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan saat memuat Top Saldo.",
      show_alert: true,
    });
  }
}
// ===============================================
// 📌 CALLBACK: BONUS_REFERRAL (FINAL FIX)
// ===============================================
if (data === "bonus_referral") {
  try {
    const fs = require("fs");
    const from = callbackQuery.from;
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const userId = from.id.toString();
    const config = require("./config.js");

    // =====================================================
    // 🔹 LOAD SYSTEM REFERRAL FROM JSON (BUKAN DARI CONFIG)
    // =====================================================
    const sysPath = "./database/SystemReferral.json";
    let sys = { Referral_Enabled: false, Referral_PerUser: 0, Referral_PerDaftar: 0 };

    if (fs.existsSync(sysPath)) {
      sys = JSON.parse(fs.readFileSync(sysPath));
    }

    const REF_ON = sys.Referral_Enabled;
    const BONUS_REFERRAL = sys.Referral_PerUser || 0;
    const BONUS_REFERRED = sys.Referral_PerDaftar || 0;

    // =====================================================
    // ❗ BLOCK TOTAL JIKA REFERRAL OFF
    // =====================================================
    if (!REF_ON) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "🔴 Sistem referral saat ini NONAKTIF.",
        show_alert: true,
      });

      await bot.editMessageCaption(
        `
🎁 <b>SISTEM REFERRAL — ManzzyID OFFICIAL</b>

🔴 <b>Referral sedang berhasil DI NONAKTIF oleh owner.</b>

Silakan kembali lagi nanti.`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬅️ Kembali", callback_data: "back_home" }],
            ],
          },
        }
      );
      return;
    }

    // =====================================================
    // 🔹 FILE referralCode.json (kode referral user)
    // =====================================================
    const codeFile = "./database/referralCode.json";
    let referralCodes = {};

    if (fs.existsSync(codeFile)) {
      referralCodes = JSON.parse(fs.readFileSync(codeFile));
    }

    // Generate referral code jika belum ada
    function generateCode() {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    }

    if (!referralCodes[userId]) {
      referralCodes[userId] = generateCode();
      fs.writeFileSync(codeFile, JSON.stringify(referralCodes, null, 2));
    }

    const finalCode = `ref_${referralCodes[userId]}`;

    // =====================================================
    // 🔹 File referral.json (log referral user)
    // =====================================================
    const referralFile = "./database/referral.json";
    let referralData = {};

    if (fs.existsSync(referralFile)) {
      referralData = JSON.parse(fs.readFileSync(referralFile));
    }

    const totalRef = Object.values(referralData).filter(
      (r) => r.referrerId === finalCode
    ).length;

    const totalBonus = Object.values(referralData)
      .filter((r) => r.referrerId === finalCode)
      .reduce((sum, r) => sum + (r.bonus || BONUS_REFERRAL), 0);

    // =====================================================
    // 🔹 Referral Link
    // =====================================================
    const botUsername = config.usernameBot;
    const referralLink = `https://t.me/${botUsername}?start=${finalCode}`;

    // =====================================================
    // 🔹 BUILD CAPTION
    // =====================================================
    const caption = `
🎁 <b>SISTEM REFERRAL — ManzzyID OFFICIAL</b>

Ajak teman & dapatkan bonus saldo otomatis! 🎉

💰 <b>Bonus untuk Kamu:</b> Rp ${BONUS_REFERRAL.toLocaleString("id-ID")}
🎁 <b>Bonus untuk Teman Baru:</b> Rp ${BONUS_REFERRED.toLocaleString("id-ID")}

👥 <b>Total Referral:</b> ${totalRef}
💵 <b>Total Bonus Kamu:</b> Rp ${totalBonus.toLocaleString("id-ID")}

🔐 <b>Kode Referral:</b> <code>${finalCode}</code>

🌐 <b>Link Referral:</b>
<a href="${referralLink}">${referralLink}</a>

<b>Cara menggunakan:</b>
1. Bagikan kode atau link kamu
2. Teman klik link → start bot
3. Bonus langsung masuk otomatis!
4. Di larang untuk melakukan curang jika misalnya ketahuan di hapus hasil referral jadi 0
5. Wajib melakukan deposit program referral aktif 
`;

    // =====================================================
    // 🔹 BUTTONS
    // =====================================================
const shareText = `
✨ 𝗥𝗘𝗙𝗘𝗥𝗥𝗔𝗟 𝗕𝗢𝗡𝗨𝗦 ✨

🚀 Ajak teman-temanmu bergabung dan dapatkan 𝗯𝗼𝗻𝘂𝘀 𝘀𝗮𝗹𝗱𝗼 𝗴𝗿𝗮𝘁𝗶𝘀! 

💎 Semakin banyak teman yang join menggunakan link kamu, semakin besar hadiah yang kamu terima!

🔗 Klik link di bawah untuk mulai:
${referralLink}
`;

const keyboard = [
  [
    {
      text: "📤 Bagikan Referral",
      url:
        "https://t.me/share/url?" +
        `url=${encodeURIComponent("")}` + // FIX → kosongkan url
        `&text=${encodeURIComponent(shareText)}`,
    },
  ],
  [{ text: "⬅️ Kembali", callback_data: "back_home" }],
];

    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: message.message_id,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });

    await bot.answerCallbackQuery(callbackQuery.id);
  } catch (err) {
    console.error("❌ REFERRAL ERROR:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan membuka menu referral.",
      show_alert: true,
    });
  }
}
// ===============================
// 🏠 PANDUAN USER (NEW MESSAGE ONLY – NO EDIT)
// ===============================
if (data === "panduan_user") {
  try {
    const fs = require("fs");
    const from = callbackQuery.from;
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const config = require("./config.js");

    // =====================================================
    // 🔹 LOAD SYSTEM REFERRAL FROM JSON (BUKAN DARI CONFIG)
    // =====================================================
    const sysPath = "./database/SystemReferral.json";
    let sys = { Referral_Enabled: false, Referral_PerUser: 0, Referral_PerDaftar: 0 };

    if (fs.existsSync(sysPath)) {
      sys = JSON.parse(fs.readFileSync(sysPath));
    }

    const BONUS_REFERRAL = sys.Referral_PerUser || 0;
    const BONUS_REFERRED = sys.Referral_PerDaftar || 0;
    
const caption = `
╔✨  *P A N D U A N   P E N G G U N A*  ✨╗
Panduan lengkap untuk menggunakan layanan Nokos.  
Didesain agar mudah dibaca, elegan, dan rapi.
╚═══════════════════════
📱 *CARA ORDER NOMOR VIRTUAL*
────────────────────────
1. Buka menu *📱 ORDER NOKOS*
2. Pilih aplikasi (WhatsApp, Telegram, dll)  
3. Pilih negara  
4. Pilih provider  
5. Pilih operator yang tersedia  
6. Cek harga → Konfirmasi order  
7. Tekan *Cek Kode SMS* untuk mengambil OTP

💡 *Tips Penting:*  
• Tetap berada di chat ini agar OTP tampil otomatis  
• Pilih operator yang stoknya banyak untuk hasil lebih cepat  
─────────────────────────
📋 SYARAT DAN KETENTUAN!
─────────────────────────
baca-sebelum-membeli
31 Januari, 2026 oleh ManzzyID Official
PENYEBAB KODE OTP SUSAH / TIDAK MASUK
1️⃣ Kode OTP Sulit Masuk?
Beberapa aplikasi(seperti WhatsApp & Telegram) memiliki sistem keamanan sangat ketat dan dapat memblokir penerimaan OTP dari nomor virtual.
2️⃣ Kode OTP Tidak Masuk Sama Sekali?
Kemungkinan besar perangkat atau nomor telahterdeteksi mencurigakan oleh sistem aplikasi, atau kualitas nomor yang digunakan sedang kurang baik.

---

💡 SOLUSI YANG DISARANKAN:

✅ Gunakan VPN – untuk membantu menyamarkan lokasi dan mengurangi deteksi keamanan.

✅ Gunakan ClonePro / Aplikasi Kloning – jika ingin mencoba di lingkungan terpisah.

✅ Gunakan Clone Akun – coba dengan akun sekunder atau baru.

✅ Tunggu Stock Nomor Baru – kualitas nomor lama mungkin sedang tidak optimal.

Jika sudah mencoba semua cara di atas dan masih bermasalah, kamu bisa batalkan pesanan. Saldo akan dikembalikan 100% tanpa potongan! 🔄
─────────────────────────
💳 *CARA DEPOSIT SALDO*
1. Klik menu *💰 DEPOSIT*
2. Pilih nominal atau input manual  
3. Scan QRIS otomatis  
4. Sistem membaca pembayaran *real-time*  
5. Jika valid → saldo langsung masuk otomatis

⚡ *Fitur deposit aktif 24 jam non-stop*
──────────────────────────
🎁 *SISTEM REFERRAL — ManzzyID OFFICIAL*
Dapatkan bonus hanya dengan mengundang teman!

💰 *Bonus untuk Kamu:* Rp ${BONUS_REFERRAL.toLocaleString("id-ID")}
🎁 *Bonus untuk Teman Baru:* Rp ${BONUS_REFERRED.toLocaleString("id-ID")}

*Cara Pakai:*
1. Ambil link referral dari menu *🎁 Referral*
2. Bagikan ke teman  
3. Jika teman pertama kali start bot → bonus langsung masuk

⭐ *Tanpa batas! Semakin banyak invite → semakin besar bonus.*
─────────────────────────
☎ *BUTUH BANTUAN?*
Hubungi Admin: *${config.urladmin}*
─────────────────────────
👉 *Tekan tombol di bawah untuk kembali ke menu utama.*
`;

    // 🟢 JANGAN EDIT PESAN → KIRIM PESAN BARU
    await bot.sendMessage(chatId, caption, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Kembali", callback_data: "back_home" }],
        ],
      },
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.error("❌ PANDUAN USER ERROR:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan.",
      show_alert: true,
    });
  }
}
// =====================================================
// ⭐ MENU RATING & ULASAN — EDIT PESAN (BUKAN KIRIM BARU)
// =====================================================
if (data === "lihat_rating") {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  const text = `
⭐ *Menu Rating & Ulasan*

Silakan pilih kategori ulasan yang ingin dilihat:
  `;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "⭐ Rating & Ulasan Bagus", callback_data: "rating_bagus" }
      ],
      [
        { text: "😞 Rating & Ulasan Jelek", callback_data: "rating_jelek" }
      ],
      [
        { text: "📜 Semua Rating & Ulasan", callback_data: "rating_all" }
      ],
      [
        { text: "🔙 Kembali", callback_data: "back_home" }
      ]
    ]
  };

  await bot.editMessageCaption(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup: keyboard
  }).catch(async () => {
    // Jika gagal editCaption → fallback ke editMessageText
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  });

  return;
}
// ====================================================================
// ⭐ RATING BAGUS (4–5) — SELALU EDIT, TANPA PESAN BARU
// ====================================================================
if (data.startsWith("rating_bagus")) {
  const fs = require("fs");
  const chatId = callbackQuery.message.chat.id;
  const message = callbackQuery.message;
  const messageId = message.message_id;

  const rateFile = "./database/ratingNokos.json";
  if (!fs.existsSync(rateFile)) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Belum ada rating tersimpan.",
      show_alert: true
    });
  }

  const all = JSON.parse(fs.readFileSync(rateFile, "utf-8"));
  const good = all.filter(r => r.rating >= 4);

  if (good.length === 0) {
    // EDIT MODE (TIDAK KIRIM BARU)
    return bot.editMessageCaption(
      "⭐ *Rating Bagus (4–5)*\n\nBelum ada ulasan bagus.",
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "lihat_rating" }]]
        }
      }
    ).catch(() => bot.editMessageText(
      "⭐ *Rating Bagus (4–5)*\n\nBelum ada ulasan bagus.",
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "lihat_rating" }]]
        }
      }
    ));
  }

  // HANDLE PAGE
  let page = 0;
  if (data.includes(":")) page = parseInt(data.split(":")[1]);

  const perPage = 5;
  const totalPages = Math.ceil(good.length / perPage);
  if (page < 0) page = 0;
  if (page >= totalPages) page = totalPages - 1;

  const start = page * perPage;
  const items = good.slice(start, start + perPage);

  // FORMAT PREMIUM
  let text = `⭐ *Rating & Ulasan Bagus (4–5)*\n\n`;
  text += `📄 *Tersedia:* ${good.length.toLocaleString("id-ID")} ulasan\n`;

  items.forEach((r, i) => {
    text += `
${start + i + 1}. *${"⭐".repeat(r.rating)} (${r.rating}/5)*
┃👤 *Nama:* ${r.userName}
┃🔗 *Username:* @${r.username}
┃🆔 *ID Telegram:* \`${r.userId}\`
╰────────────────────
┃💳 *ID Pembayaran:* \`${r.orderId}\`
┃📝 *Review:* ${r.review}
┃📅 *Tanggal:* ${r.date}
`;
  });

  // BUTTON
  const nav = [];
  const keyboard = [];

  if (page > 0) {
    nav.push({ text: "⬅ Prev", callback_data: `rating_bagus:${page - 1}` });
  }

  nav.push({ text: `📄 Hal ${page + 1}/${totalPages}`, callback_data: "noop" });

  if (page < totalPages - 1) {
    nav.push({ text: "Next ➡", callback_data: `rating_bagus:${page + 1}` });
  }

  keyboard.push(nav);
  keyboard.push([{ text: "🔙 Kembali", callback_data: "lihat_rating" }]);

  // ======================================================
  // 🔥 EDIT PESAN TANPA PERNAH MENGIRIM PESAN BARU
  // ======================================================

  // Jika pesan lama adalah foto → edit caption
  if (message.photo) {
    return bot.editMessageCaption(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard }
    }).catch(async () => {
      // Jika gagal (caption tidak bisa) → convert ke media baru
      await bot.editMessageMedia(
        {
          type: "photo",
          media: config.ppthumb // background polos
        },
        {
          chat_id: chatId,
          message_id: messageId
        }
      );

      return bot.editMessageCaption(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
      });
    });
  }

  // Jika pesan lama adalah TEXT → edit text saja
  return bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  });
}
// ====================================================================
// 😞 RATING JELEK (1–3) — FULL EDIT (NO NEW MESSAGE)
// ====================================================================
if (data.startsWith("rating_jelek")) {
  const fs = require("fs");
  const chatId = callbackQuery.message.chat.id;
  const message = callbackQuery.message;
  const messageId = message.message_id;

  const rateFile = "./database/ratingNokos.json";
  if (!fs.existsSync(rateFile)) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Belum ada rating tersimpan.",
      show_alert: true
    });
  }

  const all = JSON.parse(fs.readFileSync(rateFile, "utf-8"));
  const bad = all.filter(r => r.rating <= 3);

  if (bad.length === 0) {
    // EDIT CAPTION/TEXT — TIDAK ADA SENDMESSAGE
    if (message.photo) {
      return bot.editMessageCaption(
        "😞 *Rating Jelek (1–3)*\n\nBelum ada ulasan jelek.",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "lihat_rating" }]]
          }
        }
      ).catch(() =>
        bot.editMessageText(
          "😞 *Rating Jelek (1–3)*\n\nBelum ada ulasan jelek.",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "lihat_rating" }]]
            }
          }
        )
      );
    } else {
      return bot.editMessageText(
        "😞 *Rating Jelek (1–3)*\n\nBelum ada ulasan jelek.",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "lihat_rating" }]]
          }
        }
      );
    }
  }

  // =======================
  // HANDLE PAGE
  // =======================
  let page = 0;
  if (data.includes(":")) page = parseInt(data.split(":")[1]);

  const perPage = 5;
  const totalPages = Math.ceil(bad.length / perPage);
  if (page < 0) page = 0;
  if (page >= totalPages) page = totalPages - 1;

  const start = page * perPage;
  const items = bad.slice(start, start + perPage);

  // ========================
  // FORMAT PREMIUM
  // ========================
  let text = `😞 *Rating Jelek (1–3)*\n\n`;
  text += `📄 *Tersedia:* ${bad.length.toLocaleString("id-ID")} ulasan\n`;

  items.forEach((r, i) => {
    text += `
${start + i + 1}. *${"⭐".repeat(r.rating)} (${r.rating}/5)*
┃👤 *Nama:* ${r.userName}
┃🔗 *Username:* @${r.username}
┃🆔 *ID Telegram:* \`${r.userId}\`
╰────────────────────
┃💳 *ID Pembayaran:* \`${r.orderId}\`
┃📝 *Review:* ${r.review}
┃📅 *Tanggal:* ${r.date}
`;
  });

  // BUTTON
  const nav = [];
  const keyboard = [];

  const halTxt = `📄 Hal: ${page + 1}/${totalPages}`;

  if (page > 0) {
    nav.push({ text: "⬅ Prev", callback_data: `rating_jelek:${page - 1}` });
  }

  nav.push({ text: halTxt, callback_data: "noop" });

  if (page < totalPages - 1) {
    nav.push({ text: "Next ➡", callback_data: `rating_jelek:${page + 1}` });
  }

  keyboard.push(nav);
  keyboard.push([{ text: "🔙 Kembali", callback_data: "lihat_rating" }]);

  // ============================
  // FULL EDIT — NO NEW MESSAGE
  // ============================

  if (message.photo) {
    // Kalau awalnya foto → edit caption
    return bot.editMessageCaption(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard }
    }).catch(async () => {
      // Jika caption tidak bisa, convert dulu fotonya
      await bot.editMessageMedia(
        {
          type: "photo",
          media: config.ppthumb
        },
        { chat_id: chatId, message_id: messageId }
      );

      return bot.editMessageCaption(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
      });
    });
  }

  // Jika pesan text → edit text
  return bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  });
}
// ====================================================================
// 📜 SEMUA RATING & ULASAN — PREMIUM (FULL EDIT, NO SENDMESSAGE)
// ====================================================================
if (data.startsWith("rating_all")) {
  const fs = require("fs");
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const messageId = message.message_id;

  const rateFile = "./database/ratingNokos.json";
  if (!fs.existsSync(rateFile)) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Belum ada rating tersimpan.",
      show_alert: true
    });
  }

  const all = JSON.parse(fs.readFileSync(rateFile, "utf-8"));
  if (all.length === 0) {
    const txt = "📜 *Semua Rating & Ulasan*\n\nBelum ada ulasan tersimpan.";

    if (message.photo) {
      return bot.editMessageCaption(txt, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "lihat_rating" }]]
        }
      }).catch(() =>
        bot.editMessageText(txt, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "lihat_rating" }]]
          }
        })
      );
    }

    return bot.editMessageText(txt, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "lihat_rating" }]]
      }
    });
  }

  // =======================
  // HANDLE PAGE
  // =======================
  let page = 0;
  if (data.includes(":")) page = parseInt(data.split(":")[1]);

  const perPage = 5;
  const totalPages = Math.ceil(all.length / perPage);
  if (page < 0) page = 0;
  if (page >= totalPages) page = totalPages - 1;

  const start = page * perPage;
  const items = all.slice(start, start + perPage);

  // ========================
  // FORMAT PREMIUM
  // ========================
  let text = `📜 *Semua Rating & Ulasan*\n\n`;
  text += `📄 *Tersedia:* ${all.length.toLocaleString("id-ID")} ulasan\n`;

  items.forEach((r, i) => {
    text += `
${start + i + 1}. *${"⭐".repeat(r.rating)} (${r.rating}/5)*
┃👤 *Nama:* ${r.userName}
┃🔗 *Username:* @${r.username}
┃🆔 *ID Telegram:* \`${r.userId}\`
╰───────────────────
┃💳 *ID Pembayaran:* \`${r.orderId}\`
┃📝 *Review:* ${r.review}
┃📅 *Tanggal:* ${r.date}
`;
  });

  // ========================
  // BUTTON
  // ========================
  const nav = [];
  const keyboard = [];

  const halTxt = `📄 Hal: ${page + 1}/${totalPages}`;

  if (page > 0) nav.push({ text: "⬅ Prev", callback_data: `rating_all:${page - 1}` });
  nav.push({ text: halTxt, callback_data: "noop" });
  if (page < totalPages - 1) nav.push({ text: "Next ➡", callback_data: `rating_all:${page + 1}` });

  keyboard.push(nav);
  keyboard.push([{ text: "🔙 Kembali", callback_data: "lihat_rating" }]);

  // ============================
  // FULL EDIT — NO NEW MESSAGE
  // ============================
  if (message.photo) {
    // Kalau pesan awal foto → edit caption
    return bot.editMessageCaption(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard }
    }).catch(async () => {
      // Jika gagal → convert media dulu
      await bot.editMessageMedia(
        {
          type: "photo",
          media: config.ppthumb
        },
        {
          chat_id: chatId,
          message_id: messageId
        }
      );

      return bot.editMessageCaption(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
      });
    });
  }

  // Jika text → edit text
  return bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  });
}
// ===============================  
// 🏠 BACK HOME (EDIT FOTO & CAPTION VERSION)  
// ===============================  
if (data === "back_home") {
  try {
    const fs = require("fs");
    const from = callbackQuery.from;
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const userId = from.id;
    const username = from.username ? `@${from.username}` : "Tidak ada username";
    const name = from.first_name || "Tanpa Nama";
    const config = require("./config.js");

    // =====================================================
    // LOAD SYSTEM REFERRAL
    // =====================================================
    const sysPath = "./database/SystemReferral.json";
    let sys = { Referral_Enabled: false, Referral_PerUser: 0, Referral_PerDaftar: 0 };

    if (fs.existsSync(sysPath)) {
      sys = JSON.parse(fs.readFileSync(sysPath));
    }

    const BONUS_REFERRAL = sys.Referral_PerUser || 0;
    const BONUS_REFERRED = sys.Referral_PerDaftar || 0;

    // Hitung total user
    const usersFile = "./users.json";
    let totalUsers = 0;

    if (fs.existsSync(usersFile)) {
      const dataUsers = JSON.parse(fs.readFileSync(usersFile));
      if (Array.isArray(dataUsers)) totalUsers = dataUsers.length;
    }

    // ==========================
    // Caption HOME
    // ==========================
    const caption = `╭━〔 <b>ORDER NOMOR VIRTUAL</b> 〕━╮

<blockquote>Halo <b>${name}</b> 👋  
Selamat Datang Di Layanan Nomor Virtual <b>MANZZY ID OFFICIAL</b></blockquote>
╭────────────────────────
┣━⊳ 📊 <b>STATUS AKUN ANDA</b>  
┃• 👤 <b>Nama:</b> ${name}
┃• 🆔 <b>ID Pengguna:</b> <code>${userId}</code>
┃• 🔗 <b>Username:</b> ${username}
┃• 👥 <b>Total Pengguna:</b> <b>${totalUsers.toLocaleString("id-ID")}</b> orang
╭────────────────────────
┃🛍️ LAYANAN TERSEDIA
╰────────────────────────
┃• 📱 Nomor Virtual Untuk <b>Banyak Aplikasi</b>    
┃• 📦 Setor & Buy Noktel
┃• 🗂️ Script Bot/Source Code
╭────────────────────────
┃🔥 <b>KEUNGGULAN LAYANAN KAMI</b>
┃ 
┃✅ Proses 100% Otomatis & Instan
┃✅ Keamanan Data Terjamin
┃✅ Harga Termurah Mulai Dari Rp2.000
┃✅ Layanan Aktif 24 Jam Non-Stop
┃🤝 <b>Bonus Referral</b> – Dapatkan Rp${BONUS_REFERRAL.toLocaleString("id-ID")} Setiap Teman Yang Daftar
╰───────────────────────╯
<blockquote>🚀 <b>GASKEUN CUY ORDER SEKARANG!</b> 
Pilih Menu Dibawah Untuk Menikmati Semua Fitur Menarik Kami.</blockquote>
`;

    const keyboard = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 ORDER NOKOS VIRTUAL", callback_data: "choose_service" }],
      [
        { text: "💳 CEK SALDO", callback_data: "profile" },
        { text: "💰 TOPUP SALDO", callback_data: "topup_nokos" },
        { text: "🗂️ BUY SCRIPT", callback_data: "store_script_menu" }
      ],
      [
        { text: "🛒 HISTORY ORDER", callback_data: "history_orderbot" },
        { text: "📊 HISTORY DEPOSIT", callback_data: "riwayat_deposit" },
        { text: "🎁 REFERRAL", callback_data: "bonus_referral" }
      ],
      [
        { text: "🎫 VOUCHER SAYA", callback_data: "my_voucher" },
        { text: "📞 BANTUAN CS", callback_data: "open_support_info" },
        { text: "❓ PANDUAN", callback_data: "panduan_user" }
      ],
      [
        { text: "🏆 LIST TOP USER", callback_data: "listtop_user" },
        { text: "⭐ RATING & ULASAN", callback_data: "lihat_rating" }
      ],
      [{ text: "📥 SETOR & BUY NOKTEL", callback_data: "setor_akun_menu" }],
        ]
      }
    };
    // ===============================
    // EDIT FOTO
    // ===============================
    await bot.editMessageMedia(
      {
        type: "photo",
        media: config.ppthumb
      },
      {
        chat_id: chatId,
        message_id: message.message_id
      }
    );

    // ===============================
    // EDIT CAPTION (HOME MENU)
    // ===============================
    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: message.message_id,
      ...keyboard
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.error("❌ BACK HOME ERROR:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan saat membuka menu utama.",
      show_alert: true,
    });
  }
}

// =====================================================
// ☎️ INFO SEBELUM CHAT DEVELOPER
// =====================================================
if (data === "open_support_info") {
  const chatId = message.chat.id;
  const messageId = message.message_id;

  const supportText = `
💻 <b>Hubungi Developer Utama</b>

Ingin kerja sama, custom fitur, atau melaporkan bug pada sistem bot?
Silakan hubungi developer resmi melalui tombol di bawah.

👨‍💻 Developer siap bantu:
• Pembuatan fitur baru  
• Integrasi API  
• Perbaikan error / bug  
• Pengembangan sistem bot  

⚠️ <b>Pastikan kamu berada di private chat!</b>  
Tombol di bawah akan membuka chat langsung ke developer.

Klik tombol berikut untuk melanjutkan ⬇️
`.trim();

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👨‍💻 Chat Developer Sekarang", callback_data: "contact_admin" }],
        [{ text: "⬅️ Kembali", callback_data: "back_home" }]
      ]
    },
    parse_mode: "HTML"
  };

  // SELALU EDIT, TANPA SEND MESSAGE
  return bot.editMessageCaption(supportText, {
    chat_id: chatId,
    message_id: messageId,
    ...keyboard
  });
}

  } catch (err) {
    console.error(err);
    bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan.",
      show_alert: true,
    });
  }
});

// =====================
// CALLBACK QUERY
// =====================
bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  const data = cb.data;
  const isPrivate = cb.message.chat.type === 'private';
  const userId = cb.from.id;  
    if (await guardAll(cb)) return;  

  if (data === 'contact_admin') {
    if (!isPrivate) return bot.answerCallbackQuery(cb.id, { text: '❌ Hanya bisa di private chat!', show_alert: true });
    if (String(userId) === String(config.OWNER_ID)) return bot.sendMessage(chatId, '🧠 Kamu owner, tidak bisa kontak diri sendiri!', { parse_mode: 'Markdown' });

    // Aktifkan session user
    contactSession[userId] = true;
    if (terminatedSession[userId]) delete terminatedSession[userId];
    saveSession();

    return bot.sendMessage(chatId, '📨 Silakan kirim pesan ke admin.\nKetik *batal* untuk membatalkan.', { parse_mode: 'Markdown' });
  }
});

// =====================
// HANDLE MESSAGE
// =====================
bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const isPM = msg.chat.type === 'private';
  const isOwner = String(userId) === String(config.OWNER_ID);
  const replyTo = msg.reply_to_message;
  const text = msg.text?.trim();
  const caption = msg.caption || '';  
      if (await guardAll(msg)) return;

  // Blok pesan jika session sudah batal
  if (terminatedSession[userId] && !contactSession[userId]) return;

  // Owner membalas user
  if (isOwner && replyTo && forwardedMap[replyTo.message_id]) {
    const targetUserId = forwardedMap[replyTo.message_id];
    if (terminatedSession[targetUserId]) return; // silent jika user batal

    if (text?.toLowerCase() === 'batal') {
      delete contactSession[targetUserId];
      delete forwardedMap[replyTo.message_id];
      terminatedSession[targetUserId] = true;
      saveSession();
      await bot.sendMessage(config.OWNER_ID, `✅ Sesi dengan user <code>${targetUserId}</code> dibatalkan.`, { parse_mode: 'HTML' });
      await bot.sendMessage(targetUserId, '❌ Sesi chat berhasil dibatalkan oleh Admin. Klik 📞 untuk mulai lagi.');
      return;
    }

    // Kirim balasan owner
    try {
      if (text) await bot.sendMessage(targetUserId, `📬 <b>Balasan dari Admin:</b>\n\n${text}`, { parse_mode: 'HTML' });
      else if (msg.document) await bot.sendDocument(targetUserId, msg.document.file_id, { caption: `📦 <b>File dari Admin</b>\n<code>${msg.document.file_name}</code>\n📝 ${caption}`, parse_mode: 'HTML' });
      else if (msg.photo) await bot.sendPhoto(targetUserId, msg.photo.pop().file_id, { caption: `🖼️ <b>Foto dari Admin</b>\n📝 ${caption}`, parse_mode: 'HTML' });
      else if (msg.voice) await bot.sendVoice(targetUserId, msg.voice.file_id, { caption: `🎙️ <b>Voice dari Admin</b>\n📝 ${caption}`, parse_mode: 'HTML' });
      else if (msg.video) await bot.sendVideo(targetUserId, msg.video.file_id, { caption: `🎥 <b>Video dari Admin</b>\n📝 ${caption}`, parse_mode: 'HTML' });
      else if (msg.audio) await bot.sendAudio(targetUserId, msg.audio.file_id, { caption: `🎵 <b>Audio dari Admin</b>\n📝 ${caption}`, parse_mode: 'HTML' });

      await bot.sendMessage(config.OWNER_ID, '✅ Balasan berhasil dikirim.');
    } catch { /* silent jika gagal */ }
    return;
  }

  // User mengirim pesan ke admin
  if (isPM && contactSession[userId]) {
    if (text?.toLowerCase() === 'batal') {
      delete contactSession[userId];
      terminatedSession[userId] = true;
      saveSession();

      await bot.sendMessage(userId, '✅ Sesi chat berhasil dibatalkan. Tekan 📞 Contact Admin untuk mulai lagi.');
      await bot.sendMessage(config.OWNER_ID, `❌ Sesi chat dengan <code>${userId}</code> dibatalkan oleh user.`, { parse_mode: 'HTML' });
      return;
    }

    const info = `🆔 <code>${userId}</code>\n👤 <b>${msg.from.first_name}</b>\n🔗 @${msg.from.username || '-'}`;

    // Forward pesan ke owner
    if (text) {
      const fwd = await bot.sendMessage(config.OWNER_ID, `<b>Pesan dari User</b>\n\n${info}\n💬:\n<pre>${text}</pre>`, { parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    if (msg.document) {
      const fwd = await bot.sendDocument(config.OWNER_ID, msg.document.file_id, { caption: `📎 File dari User\n${info}\n📄 <code>${msg.document.file_name}</code>\n📝 ${caption}`, parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    if (msg.photo) {
      const fwd = await bot.sendPhoto(config.OWNER_ID, msg.photo.pop().file_id, { caption: `🖼️ Foto dari User\n${info}\n📝 ${caption}`, parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    if (msg.voice) {
      const fwd = await bot.sendVoice(config.OWNER_ID, msg.voice.file_id, { caption: `🎙️ Voice dari User\n${info}\n📝 ${caption}`, parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    if (msg.video) {
      const fwd = await bot.sendVideo(config.OWNER_ID, msg.video.file_id, { caption: `🎥 Video dari User\n${info}\n📝 ${caption}`, parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    if (msg.audio) {
      const fwd = await bot.sendAudio(config.OWNER_ID, msg.audio.file_id, { caption: `🎵 Audio dari User\n${info}\n📝 ${caption}`, parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    saveSession();
    await bot.sendMessage(userId, '✅ Berhasil Terkirim ke admin. Ketik *batal* untuk akhiri chat.', { parse_mode: 'Markdown' });
  }
});

// =====================
// BATAL COMMAND (FINAL FIX)
// =====================
bot.onText(/^\/batal(?:\s+(\d+))?$/i, async (msg, match) => {
  const userId = msg.from.id.toString();
  const targetIdFromCommand = match[1];
  const replyTo = msg.reply_to_message;
  const isOwner = userId === String(config.OWNER_ID);
  const isPM = msg.chat.type === 'private';  
      if (await guardAll(msg)) return;

  // === USER membatalkan sendiri ===
  if (!isOwner && isPM) {
    if (contactSession[userId]) {
      delete contactSession[userId];
      terminatedSession[userId] = true;
      Object.keys(forwardedMap).forEach(key => {
        if (forwardedMap[key] === userId) delete forwardedMap[key];
      });
      saveSession();

      await bot.sendMessage(userId, '✅ Sesi chat berhasil dibatalkan. Tekan 📞 Contact Admin untuk mulai lagi.');
      await bot.sendMessage(config.OWNER_ID, `❌ Sesi chat dengan <code>${userId}</code> dibatalkan oleh user.`, { parse_mode: 'HTML' });

      // Kirim dummy reply biar mode reply dihapus di Telegram
      await bot.sendMessage(userId, "💬 Sesi berhasil telah berakhir.", { reply_markup: { remove_keyboard: true } });
    } else {
      await bot.sendMessage(userId, 'ℹ️ Tidak ada sesi chat aktif.', { parse_mode: 'HTML' });
    }
    return;
  }

  // === OWNER membatalkan user ===
  if (!isOwner) return;

  let targetId;
  if (targetIdFromCommand) targetId = targetIdFromCommand;
  else if (replyTo && forwardedMap[replyTo.message_id]) targetId = forwardedMap[replyTo.message_id];
  else return bot.sendMessage(msg.chat.id, '❌ Format salah.\nGunakan:\n`/batal 123456789`\nAtau balas pesan user yang ingin dibatalkan.', { parse_mode: 'Markdown' });

  if (!contactSession[targetId]) {
    return bot.sendMessage(msg.chat.id, `ℹ️ Tidak ada sesi aktif dengan <code>${targetId}</code>.`, { parse_mode: 'HTML' });
  }

  delete contactSession[targetId];
  terminatedSession[targetId] = true;
  Object.keys(forwardedMap).forEach(key => {
    if (forwardedMap[key] === targetId) delete forwardedMap[key];
  });
  saveSession();

  await bot.sendMessage(targetId, '❌ Sesi chat dibatalkan oleh Admin.');
  await bot.sendMessage(msg.chat.id, `✅ Sesi dengan user <code>${targetId}</code> telah dibatalkan.`, { parse_mode: 'HTML' });

  // Kirim dummy reply agar "Membalas Security Bots" hilang
  await bot.sendMessage(config.OWNER_ID, "💬 Sesi berhasil telah ditutup.", { reply_markup: { remove_keyboard: true } });
});
// ===============================================
// 💰 COMMAND: /tukarpoint nominal (kelipatan 1000)
// ===============================================
bot.onText(/^\/tukarpoint(?:\s+(\d+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const nominal = match[1];

  const fs = require("fs");
  const pointPath = "./database/pointSaldo.json";
  const saldoPath = "./database/saldoOtp.json";

  // ==============
  // Load database
  // ==============
  let pointDb = {};
  let saldoDb = {};

  if (fs.existsSync(pointPath)) pointDb = JSON.parse(fs.readFileSync(pointPath));
  if (fs.existsSync(saldoPath)) saldoDb = JSON.parse(fs.readFileSync(saldoPath));

  // pastikan user ada di DB (FORMAT BENAR)
  if (!pointDb[userId]) {
    pointDb[userId] = {
      point_total: 0,
      convert_total: 0,
      history: []
    };
  }

  if (!saldoDb[userId]) saldoDb[userId] = 0;

  // ============================
  // 📌 Tutorial jika tanpa argumen
  // ============================
  if (!nominal) {
    return bot.sendMessage(
      chatId,
      `📌 *Cara penggunaan /tukarpoint:*\n\n` +
      `Gunakan:\n➡️ /tukarpoint <nominal>\n\n` +
      `🎯 Hanya kelipatan *1000*\nContoh:\n/tukarpoint 1000\n/tukarpoint 5000\n/tukarpoint 20000`,
      { parse_mode: "Markdown" }
    );
  }

  const amount = parseInt(nominal);

  // ==============================
  // ❌ Cek kelipatan 1000
  // ==============================
  if (amount % 1000 !== 0) {
    return bot.sendMessage(chatId,
      `❌ *Nominal tidak valid!* Harus kelipatan *1000*`,
      { parse_mode: "Markdown" }
    );
  }

  // ==============================
  // ❌ Cek point cukup
  // ==============================
  const userPoint = pointDb[userId].point_total;

  if (userPoint < amount) {
    return bot.sendMessage(chatId,
      `❌ Point kamu kurang!\n\nPoint sekarang: *${userPoint}*`,
      { parse_mode: "Markdown" }
    );
  }

  // ==============================
  // 🔥 PROSES PENUKARAN
  // ==============================
  pointDb[userId].point_total -= amount;
  pointDb[userId].convert_total += 1;

  // Tambah riwayat
  pointDb[userId].history.push({
    tipe: "convert_point",
    jumlah: -amount,
    tanggal: new Date().toISOString(),
    keterangan: "Tukar point ke saldo"
  });

  saldoDb[userId] += amount;

  // simpan DB
  fs.writeFileSync(pointPath, JSON.stringify(pointDb, null, 2));
  fs.writeFileSync(saldoPath, JSON.stringify(saldoDb, null, 2));

  // ==============================
  // ✅ Respon berhasil
  // ==============================
  return bot.sendMessage(chatId,
    `🎉 *Tukar Point Berhasil!*\n\n` +
    `🔻 Point dikurang: *${amount}*\n` +
    `🔺 Saldo bertambah: *${amount}*\n\n` +
    `💰 Sisa Point: *${pointDb[userId].point_total}*\n` +
    `💵 Total Saldo: *${saldoDb[userId]}*`,
    { parse_mode: "Markdown" }
  );
});
// ===============================================
// 🟩 COMMAND: /addpoint <iduser> <nominal>
// ===============================================
bot.onText(/^\/addpoint(?:\s+(.+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id.toString();
  const fs = require("fs");

  const pointPath = "./database/pointSaldo.json";

  // ❌ Hanya owner
  if (String(senderId) !== String(config.OWNER_ID)) {
    return bot.sendMessage(chatId, "🚫 *Hanya owner yang bisa memakai perintah ini!*", {
      parse_mode: "Markdown"
    });
  }

  // Jika tidak ada argumen → tampilkan tutorial
  if (!match[1]) {
    return bot.sendMessage(
      chatId,
      `🟩 *Cara Pakai Perintah /addpoint*\n\n` +
      `Format:\n` +
      `\`/addpoint <iduser> <nominal>\`\n\n` +
      `Contoh:\n` +
      `\`/addpoint 123456789 1000\`\n\n` +
      `Nominal bebas (tidak wajib kelipatan).\n` +
      `User akan otomatis dibuat di database jika belum ada.`,
      { parse_mode: "Markdown" }
    );
  }

  // Parsing argumen
  const args = match[1].trim().split(/\s+/);
  if (args.length < 2) {
    return bot.sendMessage(
      chatId,
      `⚠️ Format salah!\n\nGunakan:\n\`/addpoint <iduser> <nominal>\``,
      { parse_mode: "Markdown" }
    );
  }

  const targetId = args[0];
  const nominal = parseInt(args[1]);

  // Validasi angka
  if (isNaN(nominal) || nominal <= 0) {
    return bot.sendMessage(chatId, "⚠️ *Nominal harus berupa angka dan lebih dari 0!*", {
      parse_mode: "Markdown"
    });
  }

  // ==================
  // Load database
  // ==================
  let pointDb = {};
  if (fs.existsSync(pointPath)) {
    try {
      pointDb = JSON.parse(fs.readFileSync(pointPath));
    } catch {
      pointDb = {};
    }
  }

  // Jika user belum ada → buat struktur default
  if (!pointDb[targetId]) {
    pointDb[targetId] = {
      point_total: 0,
      convert_total: 0,
      history: []
    };
  }

  // Tambahkan point
  pointDb[targetId].point_total += nominal;

  // Catat riwayat
  pointDb[targetId].history.push({
    tipe: "add_point",
    jumlah: nominal,
    tanggal: new Date().toISOString(),
    keterangan: `Point ditambahkan oleh owner (${senderId})`
  });

  // Simpan DB
  fs.writeFileSync(pointPath, JSON.stringify(pointDb, null, 2));

  // Respon berhasil
  return bot.sendMessage(
    chatId,
    `🟩 *Point Berhasil Ditambahkan!*\n\n` +
    `👤 User ID: *${targetId}*\n` +
    `➕ Point ditambah: *${nominal}*\n` +
    `💰 Total point sekarang: *${pointDb[targetId].point_total}*`,
    { parse_mode: "Markdown" }
  );
});
// ===============================================
// 🟥 COMMAND: /delpoint <iduser> <nominal>
// ===============================================
bot.onText(/^\/delpoint(?:\s+(.+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id.toString();
  const fs = require("fs");

  const pointPath = "./database/pointSaldo.json";

  // ❌ Hanya owner
  if (String(senderId) !== String(config.OWNER_ID)) {
    return bot.sendMessage(chatId, "🚫 *Hanya owner yang bisa memakai perintah ini!*", {
      parse_mode: "Markdown"
    });
  }

  // Jika tidak ada argumen → tampilkan tutorial
  if (!match[1]) {
    return bot.sendMessage(
      chatId,
      `🟥 *Cara Pakai Perintah /delpoint*\n\n` +
      `Format:\n` +
      `\`/delpoint <iduser> <nominal>\`\n\n` +
      `Contoh:\n` +
      `\`/delpoint 123456789 500\`\n\n` +
      `Nominal adalah jumlah point yang akan dikurangi.`,
      { parse_mode: "Markdown" }
    );
  }

  // Parsing argumen
  const args = match[1].trim().split(/\s+/);
  if (args.length < 2) {
    return bot.sendMessage(
      chatId,
      `⚠️ Format salah!\n\nGunakan:\n\`/delpoint <iduser> <nominal>\``,
      { parse_mode: "Markdown" }
    );
  }

  const targetId = args[0];
  const nominal = parseInt(args[1]);

  // Validasi nominal
  if (isNaN(nominal) || nominal <= 0) {
    return bot.sendMessage(chatId, "⚠️ *Nominal harus berupa angka dan lebih dari 0!*", {
      parse_mode: "Markdown"
    });
  }

  // ==================
  // Load database
  // ==================
  let pointDb = {};
  if (fs.existsSync(pointPath)) {
    try {
      pointDb = JSON.parse(fs.readFileSync(pointPath));
    } catch {
      pointDb = {};
    }
  }

  // Jika user belum ada → buat struktur point default
  if (!pointDb[targetId]) {
    pointDb[targetId] = {
      point_total: 0,
      convert_total: 0,
      history: []
    };
  }

  const current = pointDb[targetId].point_total;

  // Hitung point setelah pengurangan
  const finalPoint = Math.max(0, current - nominal); // tidak boleh minus
  const actuallyRemoved = current - finalPoint; // berapa yang benar-benar dikurangi

  // Update point
  pointDb[targetId].point_total = finalPoint;

  // Catat history
  pointDb[targetId].history.push({
    tipe: "del_point",
    jumlah: actuallyRemoved,
    tanggal: new Date().toISOString(),
    keterangan: `Point dikurangi oleh owner (${senderId})`
  });

  // Simpan
  fs.writeFileSync(pointPath, JSON.stringify(pointDb, null, 2));

  // Respon
  return bot.sendMessage(
    chatId,
    `🟥 *Point Berhasil Dikurangi!*\n\n` +
    `👤 User ID: *${targetId}*\n` +
    `➖ Point dikurangi: *${actuallyRemoved}*\n` +
    `💰 Total point sekarang: *${finalPoint}*`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/^\/addsc(?:\s+(.+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const config = require("./config.js");

  if (userId !== config.OWNER_ID.toString()) {
    return bot.sendMessage(chatId, "❌ Hanya Owner yang bisa menambahkan script.");
  }

  if (!msg.reply_to_message || !msg.reply_to_message.document) {
    return bot.sendMessage(chatId, "⚠️ *Cara Pakai:*\nReply file/zip script, lalu ketik:\n`/addsc nama|harga|deskripsi`", { parse_mode: "Markdown" });
  }

  if (!match[1]) {
    return bot.sendMessage(chatId, "⚠️ Masukkan detail script!\nFormat: `/addsc nama|harga|deskripsi`", { parse_mode: "Markdown" });
  }

  const args = match[1].split("|");
  if (args.length < 3) {
    return bot.sendMessage(chatId, "⚠️ Format salah! Gunakan pemisah `|`\nContoh: `/addsc Sc Bot V1|50000|Fitur lengkap no enc`", { parse_mode: "Markdown" });
  }

  const name = args[0].trim();
  const price = parseInt(args[1].trim());
  const desc = args[2].trim();
  const fileId = msg.reply_to_message.document.file_id;
  const fileName = msg.reply_to_message.document.file_name;

  if (isNaN(price)) return bot.sendMessage(chatId, "❌ Harga harus berupa angka!");

  const fs = require("fs");
  const scriptPath = "./database/storeScript.json";
  let db = [];
  try {
    if (fs.existsSync(scriptPath)) db = JSON.parse(fs.readFileSync(scriptPath));
  } catch {}

  const newScript = {
    id: "SC" + Date.now(),
    name: name,
    price: price,
    desc: desc,
    fileId: fileId,
    fileName: fileName,
    uploadedAt: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
  };

  db.push(newScript);
  fs.writeFileSync(scriptPath, JSON.stringify(db, null, 2));

  await bot.sendMessage(chatId, 
    `✅ *Script Berhasil Ditambahkan!*\n\n` +
    `📂 Nama: ${name}\n` +
    `💰 Harga: Rp${price.toLocaleString("id-ID")}\n` +
    `📄 File: ${fileName}\n\n` +
    `Script sudah muncul di menu Store Script.`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/^\/delsc(?:\s+(.+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const config = require("./config.js");

    if (userId !== config.OWNER_ID.toString()) return;

    if (!match[1]) return bot.sendMessage(chatId, "⚠️ Masukkan ID Script. Cek ID di menu script.");
    
    const targetId = match[1].trim();
    const scriptPath = "./database/storeScript.json";
    let db = JSON.parse(fs.readFileSync(scriptPath));

    const newDb = db.filter(x => x.id !== targetId);
    
    if (db.length === newDb.length) {
        return bot.sendMessage(chatId, "❌ ID Script tidak ditemukan.");
    }

    fs.writeFileSync(scriptPath, JSON.stringify(newDb, null, 2));
    bot.sendMessage(chatId, "✅ Script berhasil dihapus dari database.");
});

// ===============================================
// 🏆 COMMAND: /listtoppoint (Top 10 user point)
// ===============================================
bot.onText(/^\/listtoppoint$/i, async (msg) => {
  const chatId = msg.chat.id;
  const fs = require("fs");

  const pointPath = "./database/pointSaldo.json";

  // Load DB
  let pointDb = {};
  if (fs.existsSync(pointPath)) {
    try {
      pointDb = JSON.parse(fs.readFileSync(pointPath));
    } catch {
      pointDb = {};
    }
  }

  const users = Object.entries(pointDb); // [ [userId, data], ... ]

  if (users.length === 0) {
    return bot.sendMessage(chatId, "📂 *Belum ada data point di database!*", {
      parse_mode: "Markdown"
    });
  }

  // Sort dari terbesar → terkecil
  const sorted = users.sort((a, b) => b[1].point_total - a[1].point_total);

  // Ambil top 10 (atau kurang jika tidak sampai 10)
  const top = sorted.slice(0, 10);

  let text = `🏆 *TOP 10 USER POINT*\n\n`;

  top.forEach(([id, data], i) => {
    text += 
      `*${i + 1}. ID:* \`${id}\`\n` +
      `   💰 *Point:* ${data.point_total}\n` +
      `   🔄 *Convert:* ${data.convert_total}\n\n`;
  });

  return bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
});
// ====================================================
// 🧾 COMMANDS — BOT.ONTEXT
// ====================================================
bot.onText(/^\/ownermenu$/i, async (msg) => {
  try {
    const userId = msg.from.id.toString();
    const config = require("./config.js");
    
    if (await guardAll(msg)) return;

    if (userId !== config.OWNER_ID.toString()) {
        return bot.sendMessage(msg.chat.id, "❌ Menu ini khusus Owner.");
    }

    const caption = `👑 <b>OWNER MENU (Halaman 1/3)</b>
    
<b>⚙️ PENGATURAN MODE</b>
• /self — Ubah ke Mode Self (Sendiri)
• /public — Ubah ke Mode Public
• /maintenance — Mode Maintenance (Perbaikan)
• /joinch — Wajib Join Channel (On/Off)
• /grouponly — Mode Khusus Grup

<i>Klik Next untuk menu lainnya...</i>
`;

    const buttons = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Next ➡️", callback_data: "owner_page_2" }
          ],
          [
            { text: "❌ Tutup", callback_data: "delete_msg" }
          ]
        ],
      },
      parse_mode: "HTML",
    };

    await bot.sendPhoto(msg.chat.id, config.ppthumb, {
      caption,
      ...buttons,
    });

  } catch (err) {
    console.error("Error Owner Menu:", err);
  }
});

bot.on("callback_query", async (cb) => {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const userId = cb.from.id.toString();
    const config = require("./config.js");

    if (data.startsWith("owner_page_")) {
        if (userId !== config.OWNER_ID.toString()) {
            return bot.answerCallbackQuery(cb.id, { text: "❌ Akses Ditolak!", show_alert: true });
        }

        let caption = "";
        let keyboard = [];

        if (data === "owner_page_1") {
            caption = `👑 <b>OWNER MENU (Halaman 1/5)</b>
    
<b>⚙️ PENGATURAN MODE</b>
• /self — Ubah ke Mode Self (Sendiri)
• /public — Ubah ke Mode Public
• /maintenance — Mode Maintenance (Perbaikan)
• /joinch — Wajib Join Channel (On/Off)
• /grouponly — Mode Khusus Grup`;

            keyboard = [
                [{ text: "Next ➡️", callback_data: "owner_page_2" }],
                [{ text: "❌ Tutup", callback_data: "delete_msg" }]
            ];
        }

        else if (data === "owner_page_2") {
            caption = `👑 <b>OWNER MENU (Halaman 2/5)</b>

<b>👥 USER & DATABASE</b>
• /bluser id,alasan — Blacklist User
• /unbluser id — Hapus Blacklist
• /broadcast — Kirim pesan ke semua user
• /setreferral — Atur bonus referral
• /backup — Backup database manual`;

            keyboard = [
                [
                    { text: "⬅️ Prev", callback_data: "owner_page_1" },
                    { text: "Next ➡️", callback_data: "owner_page_3" }
                ],
                [{ text: "❌ Tutup", callback_data: "delete_msg" }]
            ];
        }

        else if (data === "owner_page_3") {
            caption = `👑 <b>OWNER MENU (Halaman 3/5)</b>

<b>💰 EKONOMI & PRODUK</b>
• /addsaldo id nominal — Tambah Saldo
• /delsaldo id nominal — Kurang Saldo
• /listsaldo — Cek seluruh saldo user
• /addpoint id nominal — Tambah Poin
•/tukarpoint nominal — Tukar Poin jadi saldo semua user
• /addsc — Tambah Produk Script
• /delsc id — Hapus Produk Script`;

            keyboard = [
                [
                    { text: "⬅️ Prev", callback_data: "owner_page_2" },
                    { text: "Next ➡️", callback_data: "owner_page_4" }
                ],
                [{ text: "❌ Tutup", callback_data: "delete_msg" }]
            ];
        }
        
        else if (data === "owner_page_4") {
            caption = `👑 <b>OWNER MENU (Halaman 4/5)</b>

<b>🛍️ SETTING PRODUK</b>
• /addproduk — Tambah Produk
• /delproduk — Kurang Produk
• /addstok — Tambah Stok
• /delstok — Kurang Stok
• /editstok — Edit Stok`;

            keyboard = [
                [
                  { text: "⬅️ Prev", callback_data: "owner_page_3" },
                  { text: "Next ➡️", callback_data: "owner_page_5" }
                ],
                [{ text: "❌ Tutup", callback_data: "delete_msg" }]
            ];
        }

         else if (data === "owner_page_5") {
            caption = `👑 <b>OWNER MENU (Halaman 5/5)</b>

<b>🎟️ SETTING VOUCHER</b>
• /addvc — Tambah Voucher
• /delvc — Hapus Voucher
• /listvc — List Stok Voucher
• /claim — Ambil Voucher`;

            keyboard = [
                [{ text: "⬅️ Prev", callback_data: "owner_page_4" }],
                [{ text: "❌ Tutup", callback_data: "delete_msg" }]
            ];
        }
        await bot.editMessageCaption(caption, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard }
        }).catch(() => {});
    }

    if (data === "delete_msg") {
        bot.deleteMessage(chatId, messageId).catch(() => {});
    }
});

// ====== FIX: ADD GLOBAL DEPOSIT LOCK ======
const depositLock = {};
// ==========================================
// ==============================================
// 💰 CALLBACK "Top Up Balance" — FINAL FIX (fee ikut QRIS)
// ==============================================
bot.on("callback_query", async (callbackQuery) => {
    const { message, data, from } = callbackQuery;
    const chatId = message.chat.id;
    const userId = from.id.toString();
    const username = from.username || from.first_name || "TanpaNama";
    const name = from.first_name || from.last_name || username || "TanpaNama";
    const config = require("./config.js");
    
    if (await guardAll(message)) return;

    if (data === "topup_nokos") {
        const fs = require("fs");
        const path = require("path");
        const axios = require("axios");

        const API_KEY = config.RUMAHOTP;
        const OWNER_ID = config.OWNER_ID;
        const channellog = config.idchannel;

        if (!API_KEY) return bot.sendMessage(chatId, `⚠️ *API Key belum diset!*`, { parse_mode: "Markdown" });

        const BASE_URL = "https://www.rumahotp.io/api/v2/deposit/create";
        const STATUS_URL = "https://www.rumahotp.io/api/v2/deposit/get_status";
        const CANCEL_URL = "https://www.rumahotp.io/api/v1/deposit/cancel";
        const PAYMENT_ID = "qris";
        
        const pendingPath = path.join(__dirname, "./database/depositPending.json");
        const saldoPath = path.join(__dirname, "./database/saldoOtp.json");
        const depositPath = path.join(__dirname, "./database/deposit.json");
        const resellerPath = path.join(__dirname, "./database/reseller.json");

        const promptMsg = await bot.sendMessage(
            chatId,
            `💳 *TOP UP BALANCE*\n\nMasukkan nominal deposit yang ingin kamu isi.\n\n💡 *Minimal Rp 2000*\nContoh: \`5000\``,
            { parse_mode: "Markdown" }
        );

        bot.once("message", async (msg2) => {
            if (msg2.chat.id !== chatId || msg2.from.id !== from.id) return;
            const amount = parseInt(msg2.text.trim());

            try {
                await bot.deleteMessage(chatId, promptMsg.message_id);
                await bot.deleteMessage(chatId, msg2.message_id);
            } catch {}

            if (isNaN(amount) || amount < 2000) {
                return bot.sendMessage(chatId, `🚫 *Minimal deposit Rp 2000!*`, { parse_mode: "Markdown" });
            }

            const frames = [
                "🔄 Membuat QRIS [▰▱▱▱▱]",
                "🔄 Membuat QRIS [▰▰▱▱▱]",
                "🔄 Membuat QRIS [▰▰▰▱▱]",
                "🔄 Membuat QRIS [▰▰▰▰▱]",
                "🔄 Membuat QRIS [▰▰▰▰▰]",
                "💫 Menyiapkan QR Code...",
                "⚙️ Menghubungkan server...",
                "✅ Hampir selesai...",
            ];
            let f = 0;
            const loadingMsg = await bot.sendMessage(chatId, frames[f], { parse_mode: "Markdown" });
            const loadingInterval = setInterval(async () => {
                f = (f + 1) % frames.length;
                try {
                    await bot.editMessageText(frames[f], {
                        chat_id: chatId,
                        message_id: loadingMsg.message_id,
                        parse_mode: "Markdown",
                    });
                } catch {}
            }, 600);

            try {
                if (!fs.existsSync(pendingPath)) fs.writeFileSync(pendingPath, JSON.stringify({}));
                if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}));
                if (!fs.existsSync(depositPath)) fs.writeFileSync(depositPath, JSON.stringify([]));

                const pendingData = JSON.parse(fs.readFileSync(pendingPath));
                const saldoData = JSON.parse(fs.readFileSync(saldoPath));
                const depositData = JSON.parse(fs.readFileSync(depositPath));

                if (!pendingData[userId]) pendingData[userId] = [];
                pendingData[userId] = pendingData[userId].filter((d) => Date.now() < d.expired_at_ts);

                if (pendingData[userId].length > 0) {
                    clearInterval(loadingInterval);
                    try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch {}

                    let aktifList = pendingData[userId]
                        .map((x, i) => `#${i + 1} • ID: \`${x.id}\` • Rp${x.total.toLocaleString("id-ID")}`)
                        .join("\n");

                    return bot.sendMessage(
                        chatId,
                        `🚫 *Kamu masih punya pembayaran QRIS yang belum selesai!*\n\n${aktifList}\n\n❗ Selesaikan atau batalkan dulu sebelum membuat QRIS baru.`,
                        { parse_mode: "Markdown" }
                    );
                }

                let isReseller = false;
                try {
                    if (fs.existsSync(resellerPath)) {
                        const dbRes = JSON.parse(fs.readFileSync(resellerPath));
                        isReseller = dbRes.some(u => u.id === userId);
                    }
                } catch {}

                const UNTUNG = isReseller ? 0 : (config.UNTUNG_DEPOSIT || 0);
                const totalRequest = amount + UNTUNG;

                const response = await axios.get(`${BASE_URL}?amount=${totalRequest}&payment_id=${PAYMENT_ID}`, {
                    headers: { "x-apikey": API_KEY, Accept: "application/json" },
                });

                const data = response.data;
                if (!data.success) {
                    clearInterval(loadingInterval);
                    try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch {}
                    return bot.sendMessage(chatId, `❌ *Gagal membuat QRIS.* Coba lagi nanti.`, { parse_mode: "Markdown" });
                }

                const d = data.data;
                const diterima = amount;
                const totalBaru = d.total;
                const feeAkhir = totalBaru - diterima;

                const waktuBuat = new Date(d.created_at_ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
                const waktuExp = new Date(d.expired_at_ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

                const caption = `
🏦 *PEMBAYARAN DEPOSIT OTP DAN PANEL SMM TELAH BERHASIL*
╭━━━━━━━━━━━━━━━━━━━
┃🧾 *ID Pembayaran:* \`${d.id}\`
┃👤 *User:* @${username}
┃💰 *Nominal:* Rp${totalBaru.toLocaleString("id-ID")}
┃💵 *Biaya Admin:* Rp${feeAkhir.toLocaleString("id-ID")}
┃📥 *Diterima:* Rp${diterima.toLocaleString("id-ID")}
┃
┃🕒 *Dibuat:* ${waktuBuat}
┃⏳ *Kedaluwarsa:* ${waktuExp}
╰───────────────────
┃📸 *Scan QRIS untuk membayar!*
┃🔁 Auto cek status setiap 5 detik.
┃🕔 *Akan dibatalkan otomatis jika tidak dibayar dalam 5 menit.*
`;

                clearInterval(loadingInterval);
                try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch {}

                const sentMsg = await bot.sendPhoto(chatId, d.qr_image, {
                    caption,
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ Batalkan Pembayaran", callback_data: `bataldeposit_${d.id}_${userId}` }]],
                    },
                });

                pendingData[userId].push({
                    id: d.id,
                    total: totalBaru,
                    status: d.status,
                    expired_at_ts: d.expired_at_ts,
                    message_id: sentMsg.message_id,
                });
                fs.writeFileSync(pendingPath, JSON.stringify(pendingData, null, 2));

                const autoCancelTimer = setTimeout(async () => {
                    try {
                        const cancelRes = await axios.get(`${CANCEL_URL}?deposit_id=${d.id}`, { headers: { "x-apikey": API_KEY } });
                        if (cancelRes.data.success) {
                            try {
                                const pendingUser = pendingData[userId].find(x => x.id === d.id);
                                if (pendingUser && pendingUser.message_id) {
                                    await bot.deleteMessage(chatId, pendingUser.message_id);
                                }
                            } catch (e) {}

                            await bot.sendMessage(
                                chatId,
                                `❌ *PEMBAYARAN DIBATALKAN OTOMATIS (5 MENIT)*\n━━━━━━━━━━━━━━━━━━\n🧾 *ID Transaksi:* \`${d.id}\`\n💰 *Nominal:* Rp${totalBaru.toLocaleString("id-ID")}\n📆 *Status:* Cancelled`,
                                { parse_mode: "Markdown" }
                            );

                            depositData.push({
                                id: d.id,
                                userId,
                                name,
                                username,
                                total: totalBaru,
                                diterima: 0,
                                fee: feeAkhir,
                                status: "cancelled (auto)",
                                tanggal: new Date().toISOString(),
                                metode: "QRIS",
                            });
                            fs.writeFileSync(depositPath, JSON.stringify(depositData, null, 2));

                            pendingData[userId] = pendingData[userId].filter((x) => x.id !== d.id);
                            fs.writeFileSync(pendingPath, JSON.stringify(pendingData, null, 2));

                            clearInterval(checkInterval);
                        }
                    } catch (err) {}
                }, 5 * 60 * 1000);

                const checkInterval = setInterval(async () => {
                    try {
                        const checkRes = await axios.get(`${STATUS_URL}?deposit_id=${d.id}`, { headers: { "x-apikey": API_KEY } });
                        if (checkRes.data.success) {
                            const s = checkRes.data.data.status;
                            if (s === "success") {
                                if (global.depositLock && global.depositLock[d.id]) return;
                                if (!global.depositLock) global.depositLock = {};
                                global.depositLock[d.id] = true;

                                clearInterval(checkInterval);
                                clearTimeout(autoCancelTimer);
                                try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}

                                let currentSaldo = JSON.parse(fs.readFileSync(saldoPath));
                                currentSaldo[userId] = (currentSaldo[userId] || 0) + diterima;
                                fs.writeFileSync(saldoPath, JSON.stringify(currentSaldo, null, 2));

                                const waktuSukses = new Date(checkRes.data.data.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

                                const successMsg = `
💰 *DEPOSIT OTP DAN PANEL SMM TELAH BERHASIL!*
╭─────────────────────
┃🧾 *ID Pembayaran:* \`${checkRes.data.data.id}\`
┃👤 *User:* @${username} 
┃🆔 *ID Telegram:* (\`${userId}\`)
┃💰 *Nominal:* Rp${totalBaru.toLocaleString("id-ID")}
┃💵 *Biaya Admin:* Rp${feeAkhir.toLocaleString("id-ID")}
┃📥 *Diterima:* Rp${diterima.toLocaleString("id-ID")}
┃🏷️ *Metode:* ${checkRes.data.data.brand_name}
┃📆 *Tanggal:* ${waktuSukses}
╰────────────────────
┃💳 *Saldo kamu telah ditambah Rp${diterima.toLocaleString("id-ID")} secara otomatis!*
┃💰 *Saldo Saat Ini:* Rp${currentSaldo[userId].toLocaleString("id-ID")}
`;

                                await bot.sendMessage(chatId, successMsg, { parse_mode: "Markdown" });

                                depositData.push({
                                    id: checkRes.data.data.id,
                                    userId,
                                    name,
                                    username,
                                    total: totalBaru,
                                    diterima,
                                    fee: feeAkhir,
                                    status: "success",
                                    tanggal: new Date().toISOString(),
                                    metode: checkRes.data.data.brand_name,
                                });
                                fs.writeFileSync(depositPath, JSON.stringify(depositData, null, 2));

                                if (channellog) await bot.sendMessage(channellog, successMsg, { parse_mode: "Markdown" });
                                if (OWNER_ID) await bot.sendMessage(OWNER_ID, successMsg, { parse_mode: "Markdown" });

                                pendingData[userId] = pendingData[userId].filter((x) => x.id !== d.id);
                                fs.writeFileSync(pendingPath, JSON.stringify(pendingData, null, 2));

                                delete global.depositLock[d.id];
                            }
                        }
                    } catch (err) {}
                }, 5000);

            } catch (err) {
                clearInterval(loadingInterval);
                try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch {}
                return bot.sendMessage(chatId, `⚠️ Terjadi kesalahan saat membuat QRIS.\n\nDetail: ${err.message}`, { parse_mode: "Markdown" });
            }
        });
    }
});

// ==============================================
// 🧾 HANDLE BUTTON "BATAL PEMBAYARAN"
// ==============================================
bot.on("callback_query", async (cb) => {
  try {
    const data = cb.data;
    if (!data.startsWith("bataldeposit_")) return;

    const fs = require("fs");
    const axios = require("axios");
    const config = require("./config.js");

    const [_, depositId, uid] = data.split("_");
    const userId = cb.from.id.toString();
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;

    if (userId !== uid) {
      return bot.answerCallbackQuery(cb.id, {
        text: "❌ Kamu tidak bisa membatalkan deposit orang lain!",
        show_alert: true
      });
    }

    const API_KEY = config.RUMAHOTP;
    const CANCEL_URL = "https://www.rumahotp.io/api/v1/deposit/cancel";
    const pendingPath = "./database/depositPending.json";
    const depositPath = "./database/deposit.json";

    if (!fs.existsSync(depositPath)) fs.writeFileSync(depositPath, JSON.stringify([]));
    if (!fs.existsSync(pendingPath)) fs.writeFileSync(pendingPath, JSON.stringify({}));

    const depositData = JSON.parse(fs.readFileSync(depositPath));
    const pendingData = JSON.parse(fs.readFileSync(pendingPath));

    // 🟩 Cari data pending untuk ambil total aslinya
    let totalNominal = 0;
    if (pendingData[userId]) {
      const found = pendingData[userId].find(x => x.id === depositId);
      if (found) totalNominal = found.total || 0;
    }

    // Batalkan di API RumahOTP
    const cancelRes = await axios.get(`${CANCEL_URL}?deposit_id=${depositId}`, {
      headers: { "x-apikey": API_KEY }
    });

    if (cancelRes.data.success) {
      // Hapus dari pending
      if (pendingData[userId]) {
        pendingData[userId] = pendingData[userId].filter(x => x.id !== depositId);
        fs.writeFileSync(pendingPath, JSON.stringify(pendingData, null, 2));
      }

      try { await bot.deleteMessage(chatId, msgId); } catch {}

      await bot.sendMessage(chatId, `
❌ *Pembayaran Dibatalkan!*
━━━━━━━━━━━━━━━━━━
🧾 *ID Transaksi:* \`${depositId}\`
👤 *User:* [${cb.from.first_name}](tg://user?id=${userId})
💰 *Nominal:* Rp${totalNominal.toLocaleString('id-ID')}
💬 *Status:* Cancelled oleh pengguna
`, { parse_mode: "Markdown" });

depositData.push({
  id: depositId,
  userId,
  name: cb.from.first_name || "Unknown",
  username: cb.from.username || cb.from.first_name || "TanpaUsername",
  total: totalNominal,
  status: "cancelled",
  tanggal: new Date().toISOString(),
  metode: cancelRes.data.data?.brand_name || "QRIS",
});
      fs.writeFileSync(depositPath, JSON.stringify(depositData, null, 2));

      await bot.answerCallbackQuery(cb.id, {
        text: "✅ Pembayaran berhasil dibatalkan.",
        show_alert: false
      });

    } else {
      await bot.answerCallbackQuery(cb.id, {
        text: "⚠️ Gagal membatalkan! Mungkin sudah dibayar atau expired.",
        show_alert: true
      });
    }

  } catch (err) {
    console.error("Error bataldeposit:", err.message);
    await bot.answerCallbackQuery(cb.id, {
      text: "❌ Terjadi kesalahan internal.",
      show_alert: true
    });
  }
});
// ==============================================
// 🛒 /listh2h — Cari Produk H2H RumahOTP (Pagination)
// ==============================================
bot.onText(/^\/listh2h(?:@[\w_]+)?\s*(.*)?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const keyword = (match[1] || "").toLowerCase().trim();

    const axios = require("axios");
    const config = require("./config.js");
        const userId = msg.from.id.toString();  
        if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "Markdown" }
      );
    }

    if (!keyword)
        return bot.sendMessage(chatId,
`❗ *Cara pakai:*
Gunakan perintah:
\`/listh2h <kata kunci>\`

Contoh:
• /listh2h dana  
• /listh2h ff  
• /listh2h mlbb 86  
• /listh2h pulsa`,
        { parse_mode: "Markdown" }
    );

try {
    const res = await axios.get("https://www.rumahotp.io/api/v1/h2h/product", {
        headers: { "x-apikey": config.RUMAHOTP }
    });

    let list = res.data.data || [];

    // 🔥 Urutkan harga termurah → termahal
    list = list.sort((a, b) => a.price - b.price);

    const result = list.filter(p =>
        p.name.toLowerCase().includes(keyword) ||
        p.brand.toLowerCase().includes(keyword) ||
        p.note.toLowerCase().includes(keyword) ||
        p.code.toLowerCase().includes(keyword)
    );

    if (result.length === 0)
        return bot.sendMessage(chatId, `⚠️ Tidak ada produk ditemukan untuk kata kunci *${keyword}*`, { parse_mode: "Markdown" });

    // simpan data ke memory
    const pageSize = 5;
    const totalPages = Math.ceil(result.length / pageSize);

    const state = {
        keyword,
        result,
        pageSize,
        totalPages
    };

    global.h2hPages = global.h2hPages || {};
    global.h2hPages[chatId] = state;

    sendH2HPage(bot, chatId, 1);

} catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Terjadi kesalahan saat mengambil produk.");
}
});

// ==============================================
// FUNGSI KIRIM HALAMAN (EDIT MESSAGE)
// ==============================================
function sendH2HPage(bot, chatId, page, messageId = null) {
    const data = global.h2hPages?.[chatId];
    if (!data) return;

    const { keyword, result, pageSize, totalPages } = data;

    const start = (page - 1) * pageSize;
    const sliced = result.slice(start, start + pageSize);

    let text = `📦 *Hasil Pencarian Produk H2H*\n`;
    text += `🔍 Kata kunci: *${keyword}*\n`;
    text += `📊 Total ditemukan: *${result.length}*\n`;
    text += `📄 Halaman: *${page}/${totalPages}*\n`;
    text += `━━━━━━━━━━━━━━━━━━\n`;

    for (const p of sliced) {
        text += `
💠 *${p.name}*
🧩 Code: \`${p.code}\`
🏷️ Brand: *${p.brand}*
📂 Kategori: *${p.category}*
💬 Note: ${p.note}
💰 Harga: Rp${p.price.toLocaleString("id-ID")}
━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    if (page > 1) buttons.push({ text: "⬅️ Prev", callback_data: `h2h_prev_${page}` });
    if (page < totalPages) buttons.push({ text: "➡️ Next", callback_data: `h2h_next_${page}` });

    const options = {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [buttons] }
    };

    // Jika pertama kali → sendMessage
    if (!messageId) {
        bot.sendMessage(chatId, text, options);
    } else {
        // Jika next/prev → editMessageText
        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [buttons] }
        }).catch(err => console.log("Edit error:", err.message));
    }
}

// ==============================================
// CALLBACK NEXT & PREV (EDIT MODE)
// ==============================================
bot.on("callback_query", (cb) => {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    if (data.startsWith("h2h_next_")) {
        let page = Number(data.split("_")[2]);
        sendH2HPage(bot, chatId, page + 1, messageId);
        bot.answerCallbackQuery(cb.id);
    }

    if (data.startsWith("h2h_prev_")) {
        let page = Number(data.split("_")[2]);
        sendH2HPage(bot, chatId, page - 1, messageId);
        bot.answerCallbackQuery(cb.id);
    }
});
// ==============================================
// 💳 /orderh2h <kode> <target> + AUTO STATUS CHECK
// ==============================================
bot.onText(/^\/orderh2h(?:@[\w_]+)?(?:\s+(\S+)\s+(\S+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const code = match[1];
    const target = match[2];
    const userId = msg.from.id.toString();

    const axios = require("axios");
    const config = require("./config.js");  

    if (await guardAll(msg)) return;


    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "Markdown" }
      );
    }
    
    // ❗ Jika tanpa argumen → kasih tutorial
    if (!code || !target) {
        return bot.sendMessage(
            chatId,
`❗ *Format salah!*

Gunakan perintah:
*/orderh2h <kode> <target>*

Contoh:
\`/orderh2h pln 1234567890\`
\`/orderh2h pulsa 08951234xxxx\`

📌 *kode* = kode produk (cek daftar produk)
📌 *target* = nomor / tujuan pembelian

Silakan coba lagi.`,
            { parse_mode: "Markdown" }
        );
    }

    const loading = await bot.sendMessage(chatId, "⏳ *Memproses transaksi...*", {
        parse_mode: "Markdown"
    });

    try {
        // 🔥 Buat transaksi
        const url = `https://www.rumahotp.io/api/v1/h2h/transaksi/create?id=${code}&target=${target}`;
        const res = await axios.get(url, {
            headers: {
                "x-apikey": config.RUMAHOTP,
                "Accept": "application/json"
            }
        });

        if (!res.data.success) {
            return bot.editMessageText(
                `❌ *Transaksi gagal!*\nPesan: ${res.data.message || "Tidak diketahui."}`,
                { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
            );
        }

        const d = res.data.data;

        // ======================
        // 🟦 TEXT HASIL PEMBUATAN ORDER
        // ======================
        const initialText = 
`✅ *Transaksi Berhasil Dibuat!*

🛒 *Produk:* ${d.product?.name || "-"}
🏷️ Brand: ${d.product?.brand || "-"}
🧩 Code: \`${d.product?.code || "-"}\`
📂 Kategori: ${d.product?.category || "-"}

🎯 *Tujuan:* ${d.tujuan}

📌 *Status Awal:* ${d.status}
🆔 *ID Transaksi:* \`${d.id}\`

⏳ *Sedang memantau status transaksi...*`;

        await bot.editMessageText(initialText, {
            chat_id: chatId,
            message_id: loading.message_id,
            parse_mode: "Markdown"
        });

        // ==========================================
        // 🔥 AUTO CHECK STATUS TIAP 5 DETIK
        // ==========================================
        const orderId = d.id;

        const interval = setInterval(async () => {
            try {
                const statusURL = `https://www.rumahotp.io/api/v1/h2h/transaksi/status?transaksi_id=${orderId}`;

                const s = await axios.get(statusURL, {
                    headers: {
                        "x-apikey": config.RUMAHOTP,
                        "Accept": "application/json"
                    }
                });

                if (!s.data.success) return;

                const st = s.data.data;

                // ======================
                // 🟨 Jika masih proses
                // ======================
                if (st.status === "processing") {
                    return bot.editMessageText(
`⏳ *Transaksi Diproses...*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}
📦 Status: *processing*

⏳ Sistem sedang menunggu respon provider...`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
                    );
                }

                // ======================
                // 🟩 Jika sukses
                // ======================
                if (st.status === "success") {
                    clearInterval(interval);

                    return bot.editMessageText(
`🎉 *TRANSAKSI BERHASIL!*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}
📦 Status: *SUCCESS*

🧾 Produk: ${st.product?.name}
🏷 Brand: ${st.product?.brand}
💰 Harga: Rp${st.price.toLocaleString("id-ID")}

🔐 *SN:* \`${st.response?.sn || "-"}\`

🕒 Waktu Provider: ${st.response?.time || "-"}

✅ Transaksi telah selesai.`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
                    );
                }

                // ======================
                // 🟥 Jika gagal
                // ======================
                if (st.status === "failed" || st.status === "canceled") {
                    clearInterval(interval);

                    return bot.editMessageText(
`❌ *TRANSAKSI GAGAL!*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}

📦 Status: *${st.status.toUpperCase()}*
💬 Provider Message: ${st.response?.status || "-"}

🔁 Refund: ${st.refund ? "✔️ Iya" : "❌ Tidak"}`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
                    );
                }

            } catch (e) {
                console.log("ERROR AUTO CHECK:", e);
            }

        }, 5000); // ⏳ cek status tiap 5 detik

    } catch (err) {
        console.error("ORDER H2H ERROR:", err);
        bot.editMessageText(`❌ Terjadi kesalahan saat memproses transaksi.`, {
            chat_id: chatId,
            message_id: loading.message_id,
            parse_mode: "Markdown"
        });
    }
});
// ==============================================
// 💳 /cairkan <nominal>  — AUTO MAP + AUTO STATUS CHECK
// ==============================================
bot.onText(/^\/cairkan(?:@[\w_]+)?(?:\s+(\S+))?(?:\s+(\S+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const code = match[1] ? match[1].trim() : null;
    const target = match[2] ? match[2].trim() : null;

    const axios = require("axios");
    const config = require("./config.js");

    const userId = msg.from.id.toString();  
    if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "Markdown" }
      );
    }

    // ==============================================
    // ❗ Jika tanpa argumen → TAMPILKAN TUTORIAL
    // ==============================================
    if (!code) {
        return bot.sendMessage(
            chatId,
`❗ *Format salah!*

Gunakan perintah:
*/cairkan <nominal>*

Contoh:
\`/cairkan 2000\`
\`/cairkan 5000\`
\`/cairkan 10000\`

📌 *nominal* = nominal pencairan yang akan dilakukan ke e-wallet (otomatis ke nomor di config).`,
            { parse_mode: "Markdown" }
        );
    }

    // ==============================================
    // Jika hanya 1 argumen → tetap anggap user cuma input nominal, beri tutorial
    // ==============================================
    if (code && !target && isNaN(code)) {
        return bot.sendMessage(
            chatId,
`❗ *Format salah!*

Untuk input manual:
\`/cairkan <kode_produk> <nomor_tujuan>\`

Contoh:
\`/cairkan D1 081234xxxxxx\`

Untuk input berdasarkan nominal:
\`/cairkan 2000\` (otomatis ke nomor pencairan di config)`,
            { parse_mode: "Markdown" }
        );
    }

    const loading = await bot.sendMessage(chatId, "⏳ *Memproses transaksi...*", {
        parse_mode: "Markdown"
    });

    try {

        // ==============================================
        // AUTO MAP NOMINAL → CODE DARI CONFIG
        // ==============================================
        let finalCode = code;
        let finalTarget = target;

        // Hanya angka = user minta nominal
        if (!isNaN(code)) {

            // ==============================================
            // ❌ VALIDASI KELIPATAN 1000
            // ==============================================
            const nominalUser = Number(code);
            if (nominalUser % 1000 !== 0) {
                return bot.editMessageText(
                    `❌ Nominal *${code}* tidak valid!\nNominal harus kelipatan *1000*.\n\nContoh valid:\n• 1000\n• 2000\n• 5000\n• 10000`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
                );
            }

            // Mapping prefix H2H sesuai layanan
            const prefixMap = {
                dana: "D",
                gopay: "GPY",
                ovo: "OVO",
                shopeepay: "SHOPE",
                linkaja: "LINK"
            };

            const ewallet = config.type_ewallet_RUMAHOTP?.toLowerCase();
            const prefix = prefixMap[ewallet];

            if (!prefix) {
                return bot.editMessageText(
                    `❌ Prefix untuk ewallet *${config.type_ewallet_RUMAHOTP}* tidak ditemukan!`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
                );
            }

            const productRes = await axios.get("https://www.rumahotp.io/api/v1/h2h/product", {
                headers: { "x-apikey": config.RUMAHOTP }
            });

            const all = productRes.data.data || [];

            // Filter produk sesuai prefix ewallet
            const filtered = all.filter(x => x.code.startsWith(prefix));

            // Cari produk berdasarkan angka murni (2000, 5000, dst)
            const found = filtered.find(x => {
                const angkaName = Number(String(x.name).replace(/\D/g, ""));
                const angkaNote = Number(String(x.note).replace(/\D/g, ""));
                return angkaName === nominalUser || angkaNote === nominalUser;
            });

            if (!found) {
                return bot.editMessageText(
                    `❌ Produk dengan nominal *${code}* tidak ditemukan untuk *${config.type_ewallet_RUMAHOTP}*`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
                );
            }

            finalCode = found.code; 
            finalTarget = config.nomor_pencairan_RUMAHOTP;
        }

        // Jika user manual input: /orderh2h D1 0812…
        if (!finalTarget) {
            return bot.editMessageText(
                "⚠️ Format salah!\nContoh:\n• /orderh2h 2000\n• /orderh2h D1 08123xxxx",
                { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
            );
        }

        // ==============================================
        // 🔥 CREATE TRANSAKSI
        // ==============================================
        const url = `https://www.rumahotp.io/api/v1/h2h/transaksi/create?id=${finalCode}&target=${finalTarget}`;
        const res = await axios.get(url, {
            headers: {
                "x-apikey": config.RUMAHOTP,
                "Accept": "application/json"
            }
        });

        if (!res.data.success) {
            return bot.editMessageText(
                `❌ *Transaksi gagal!*\nPesan: ${res.data.message || "Tidak diketahui."}`,
                { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
            );
        }

        const d = res.data.data;

        const initialText =
`✅ *Transaksi Berhasil Dibuat!*

🛒 *Produk:* ${d.product?.name || "-"}
🏷️ Brand: ${d.product?.brand || "-"}
🧩 Code: \`${d.product?.code || "-"}\`
📂 Kategori: ${d.product?.category || "-"}

🎯 *Tujuan:* ${d.tujuan}

📌 *Status Awal:* ${d.status}
🆔 *ID Transaksi:* \`${d.id}\`

⏳ *Sedang memantau status transaksi...*`;

        await bot.editMessageText(initialText, {
            chat_id: chatId,
            message_id: loading.message_id,
            parse_mode: "Markdown"
        });

        // ==============================================
        // 🔥 AUTO CHECK STATUS TIAP 5 DETIK
        // ==============================================
        const orderId = d.id;

        const interval = setInterval(async () => {
            try {
                const s = await axios.get(
                    `https://www.rumahotp.io/api/v1/h2h/transaksi/status?transaksi_id=${orderId}`,
                    {
                        headers: {
                            "x-apikey": config.RUMAHOTP,
                            "Accept": "application/json"
                        }
                    }
                );

                if (!s.data.success) return;

                const st = s.data.data;

                if (st.status === "processing") {
                    return bot.editMessageText(
`⏳ *Transaksi Diproses...*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}
📦 Status: *processing*

⏳ Menunggu respon provider...`,
                        { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
                    );
                }

                if (st.status === "success") {
                    clearInterval(interval);

                    return bot.editMessageText(
`🎉 *TRANSAKSI BERHASIL!*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}
📦 Status: *SUCCESS*

🧾 Produk: ${st.product?.name}
🏷 Brand: ${st.product?.brand}
💰 Harga: Rp${st.price.toLocaleString("id-ID")}

🔐 *SN:* \`${st.response?.sn || "-"}\`
🕒 Waktu Provider: ${st.response?.time || "-"}

✅ Transaksi selesai.`,
                        { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
                    );
                }

                if (st.status === "failed" || st.status === "canceled") {
                    clearInterval(interval);

                    return bot.editMessageText(
`❌ *TRANSAKSI GAGAL!*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}

📦 Status: *${st.status.toUpperCase()}*
💬 Pesan Provider: ${st.response?.status || "-"}

🔁 Refund: ${st.refund ? "✔️ Iya" : "❌ Tidak"}`,
                        { chat_id: chatId, message_id: loading.message_id, parse_mode: "Markdown" }
                    );
                }

            } catch (e) {
                console.log("ERROR AUTO CHECK:", e);
            }

        }, 5000);

    } catch (err) {
        console.error("ORDER H2H ERROR:", err);
        bot.editMessageText(`❌ Terjadi kesalahan saat memproses transaksi.`, {
            chat_id: chatId,
            message_id: loading.message_id,
            parse_mode: "Markdown"
        });
    }
});

// ===============================================
// ⚙️ SETTING REFERRAL — OWNER ONLY (FINAL FIX)
// ===============================================
bot.onText(/^\/setreferral(?:\s+(.+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const args = match[1] ? match[1].split(" ") : [];

  const fs = require("fs");
  const config = require("./config.js");  
      if (await guardAll(msg)) return;

  const dbPath = "./database/SystemReferral.json";

  // ===== LOADING REFERRAL JSON =====
  function loadReferral() {
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  }

  // ===== SAVE REFERRAL JSON =====
  function saveReferral(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  }

  // Hanya owner
  if (userId !== config.OWNER_ID.toString()) {
    return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses perintah ini.");
  }

  // Load data sekarang
  let ref = loadReferral();

  // ================================
  // 📘 TUTORIAL SAAT TANPA ARGUMEN
  // ================================
  if (args.length === 0) {
return bot.sendMessage(
  chatId,
  `
⚙️ <b>SETTINGS REFERRAL</b>
Atur sistem referral bot kamu dengan mudah.

==============================
<b>📌 FORMAT PERINTAH</b>
==============================

<b>1️⃣ /setreferral peruser &lt;angka&gt;</b>
💰 Bonus yang diterima PEMILIK link referral  
Contoh: <code>/setreferral peruser 500</code>

<b>2️⃣ /setreferral perdaftar &lt;angka&gt;</b>
🎁 Bonus untuk USER yang daftar lewat link  
Contoh: <code>/setreferral perdaftar 300</code>

<b>3️⃣ /setreferral on</b>
🔵 Mengaktifkan sistem referral

<b>4️⃣ /setreferral off</b>
🔴 Menonaktifkan sistem referral

==============================
<b>📊 STATUS SAAT INI</b>
==============================
• Bonus PerUser: <b>${ref.Referral_PerUser}</b>
• Bonus PerDaftar: <b>${ref.Referral_PerDaftar}</b>
• Status Referral: <b>${ref.Referral_Enabled ? "ON 🔵" : "OFF 🔴"}</b>

Gunakan perintah di atas untuk mengubah pengaturan referral.
  `,
  { parse_mode: "HTML" }
);
  }

  const type = args[0].toLowerCase();

  // ====== /setreferral peruser 500 ======
  if (type === "peruser") {
    const value = parseInt(args[1]);

    if (isNaN(value) || value < 0)
      return bot.sendMessage(chatId, "❌ Masukkan angka yang valid.");

    ref.Referral_PerUser = value;
    saveReferral(ref);

    return bot.sendMessage(chatId, `✅ Bonus <b>PerUser</b> diperbarui menjadi: <b>${value}</b>`, {
      parse_mode: "HTML",
    });
  }

  // ====== /setreferral perdaftar 500 ======
  if (type === "perdaftar") {
    const value = parseInt(args[1]);

    if (isNaN(value) || value < 0)
      return bot.sendMessage(chatId, "❌ Masukkan angka yang valid.");

    ref.Referral_PerDaftar = value;
    saveReferral(ref);

    return bot.sendMessage(chatId, `✅ Bonus <b>PerDaftar</b> diperbarui menjadi: <b>${value}</b>`, {
      parse_mode: "HTML",
    });
  }

  // ====== /setreferral on ======
  if (type === "on") {
    ref.Referral_Enabled = true;
    saveReferral(ref);

    return bot.sendMessage(chatId, "✅ Sistem referral telah *DI-AKTIFKAN*.", {
      parse_mode: "Markdown",
    });
  }

  // ====== /setreferral off ======
  if (type === "off") {
    ref.Referral_Enabled = false;
    saveReferral(ref);

    return bot.sendMessage(chatId, "🔴 Sistem referral telah *DI-NONAKTIFKAN*.", {
      parse_mode: "Markdown",
    });
  }

  return bot.sendMessage(chatId, "❌ Format salah. Ketik <b>/setreferral</b> untuk tutorial lengkap.", {
    parse_mode: "HTML",
  });
});

bot.onText(/^\/addvc(?:\s+(\S+))?(?:\s+(\d+))?(?:\s+(\d+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const config = require("./config.js");

  if (userId !== config.OWNER_ID.toString()) return;

  const codeInput = match[1];
  const percentInput = match[2];
  const limitInput = match[3];

  if (!codeInput || !percentInput || !limitInput) {
    return bot.sendMessage(chatId, 
      `❌ <b>FORMAT SALAH</b>\n\nGunakan:\n<code>/addvc KODE PERSEN LIMIT</code>\n\nContoh:\n<code>/addvc SALE20 20 200</code>`, 
      { parse_mode: "HTML" }
    );
  }

  const percent = parseInt(percentInput);
  if (percent < 1 || percent > 100) return bot.sendMessage(chatId, "❌ Persen harus antara 1-100.");

  let db = loadVoucher();
  const code = codeInput.toUpperCase();

  if (db.find(v => v.code === code)) {
    return bot.sendMessage(chatId, `❌ Kode <code>${code}</code> sudah ada.`, { parse_mode: "HTML" });
  }

  const limit = parseInt(limitInput);

  db.push({
    code: code,
    percent: percent,
    limit: limit,
    claimedBy: [],
    created_at: new Date().toISOString(),
    active: true
  });
  saveVoucher(db);

  const captionOwner = `
<b>✅ VOUCHER BERHASIL DIBUAT</b>

Kode: <code>${code}</code>
Diskon: ${percent}%
Limit: ${limit} user

<b>📋 INFO</b>
• User klaim dengan: /claim ${code}
• Cek voucher: /listvc
• Hapus voucher: /delvc ${code}

<b>🎯 CARA PAKAI</b>
User bisa gunakan untuk:
• Order nokos
• Beli produk
• Potongan harga langsung
`;
  await bot.sendMessage(chatId, captionOwner, { parse_mode: "HTML" });

  if (config.idchannel) {
      const captionChannel = `
📢 <b>VOUCHER DISKON BARU!</b>

🎟️ <b>Kode:</b> <code>${code}</code>
📉 <b>Diskon:</b> ${percent}%
👥 <b>Kuota:</b> ${limit} Orang

Silakan klaim di bot sekarang!
👉 Ketik: <code>/claim ${code}</code>
`;
      await bot.sendMessage(config.idchannel, captionChannel, { parse_mode: "HTML" }).catch(()=>{});
  }
});

bot.onText(/^\/delvc(?:\s+(\S+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const config = require("./config.js");
    if (userId !== config.OWNER_ID.toString()) return;

    const code = match[1] ? match[1].toUpperCase() : null;
    if (!code) return bot.sendMessage(chatId, "⚠️ Masukkan kode.", {parse_mode:"HTML"});

    let db = loadVoucher();
    const newDb = db.filter(v => v.code !== code);
    
    if (db.length === newDb.length) return bot.sendMessage(chatId, "❌ Kode tidak ditemukan.");
    
    saveVoucher(newDb);
    await bot.sendMessage(chatId, `✅ Voucher <code>${code}</code> berhasil dihapus.`, {parse_mode:"HTML"});
});

bot.onText(/^\/listvc$/i, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const config = require("./config.js");

  if (userId !== config.OWNER_ID.toString()) return;

  let db = loadVoucher();

  if (db.length === 0) {
    return bot.sendMessage(chatId, "📂 Tidak ada voucher aktif.");
  }

  let message = `<b>🎫 DAFTAR VOUCHER</b>\n────────────────\n`;
  
  db.forEach((v, index) => {
    const sisa = v.limit - v.claimedBy.length;
    message += `<b>${index + 1}. ${v.code}</b>\n`;
    message += `   └─📉 Diskon: ${v.percent}%\n`;
    message += `   └─👥 Terpakai: ${v.claimedBy.length}/${v.limit}\n`;
    message += `   └─📦 Sisa: ${sisa}\n\n`;
  });

  await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
});

bot.onText(/^\/claim(?:\s+(\S+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const codeInput = match[1];
  const config = require("./config.js");

  if (await guardAll(msg)) return;

  if (!codeInput) return bot.sendMessage(chatId, "⚠️ Masukkan kode voucher. Contoh: `/claim SALE20`", { parse_mode: "Markdown" });

  const code = codeInput.toUpperCase();
  let db = loadVoucher();
  const index = db.findIndex(v => v.code === code);

  if (index === -1) {
      return bot.sendMessage(chatId, 
      `<b>❌ KODE VOUCHER TIDAK VALID</b>\n\nFormat: Hanya huruf dan angka\nContoh: DISKON20, PROMO50, SPECIAL10`, 
      { parse_mode: "HTML" }
      );
  }

  const voucher = db[index];

  if (voucher.claimedBy.length >= voucher.limit) {
    return bot.sendMessage(chatId, "❌ Voucher sudah habis terjual!", { parse_mode: "Markdown" });
  }

  if (voucher.claimedBy.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Kamu sudah pernah klaim voucher ini.", { parse_mode: "Markdown" });
  }

  const activeDiscounts = loadActiveDiscount();
  if (activeDiscounts[userId]) {
     return bot.sendMessage(chatId, "⚠️ Kamu masih punya diskon aktif yang belum dipakai. Gunakan dulu!", { parse_mode: "Markdown" });
  }

  activeDiscounts[userId] = {
      code: voucher.code,
      percent: voucher.percent
  };
  saveActiveDiscount(activeDiscounts);

  voucher.claimedBy.push(userId);
  db[index] = voucher;
  saveVoucher(db);

  const sisa = voucher.limit - voucher.claimedBy.length;

  const captionUser = `
<b>🎉 KLAIM BERHASIL!</b>

🎟️ Kode: <code>${voucher.code}</code>
📉 Diskon Aktif: <b>${voucher.percent}%</b>
📦 Sisa Kuota: <b>${sisa}</b>

Silakan lakukan transaksi (Nokos/Produk), harga otomatis terpotong.
`;
  await bot.sendMessage(chatId, captionUser, { parse_mode: "HTML" });

  if (config.idchannel) {
      const userLink = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
      const captionChannel = `
🔔 <b>VOUCHER BERHASIL DIKLAIM!</b>

👤 <b>User:</b> ${userLink}
🆔 <b>ID:</b> <code>${userId}</code>
🎟️ <b>Kode:</b> <code>${voucher.code}</code>
📉 <b>Diskon:</b> ${voucher.percent}%
📦 <b>Sisa Kuota:</b> ${sisa} / ${voucher.limit}

Buruan klaim sebelum habis!
`;
      await bot.sendMessage(config.idchannel, captionChannel, { parse_mode: "HTML" }).catch(()=>{});
  }
});

// ======================= 🔒 /SELF =======================
bot.onText(/^\/self$/i, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();  
      if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "Markdown" }
      );
    }

    // 📂 Baca status mode sekarang
    let currentMode = { self: false };
    if (fs.existsSync(modeFile)) {
      try {
        currentMode = JSON.parse(fs.readFileSync(modeFile, "utf8"));
      } catch {
        currentMode = { self: false };
      }
    }

    // ⚠️ Jika sudah self mode
    if (currentMode.self === true) {
      return bot.sendMessage(
        chatId,
        "⚠️ Mode *Self* sudah aktif sebelumnya!\nTidak perlu diaktifkan lagi.",
        { parse_mode: "Markdown" }
      );
    }

    // ✅ Aktifkan mode self
    fs.writeFileSync(modeFile, JSON.stringify({ self: true }, null, 2));
    await bot.sendMessage(
      chatId,
      "🔒 Mode *Self* berhasil diaktifkan!\nSekarang hanya *owner* yang bisa menggunakan bot.",
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    logError(err, "/self");
  }
});

bot.on("callback_query", async (cb) => {
  const data = cb.data;
  const message = cb.message;
  const chatId = message.chat.id;
  const messageId = message.message_id;
  const userId = cb.from.id.toString();
  const config = require("./config.js");
  const fs = require("fs");
  const path = require("path");

  if (data === "my_voucher") {
    const activeDiscountPath = path.join(__dirname, "./database/active_discounts.json");
    let activeDiscounts = {};
    try {
      if (fs.existsSync(activeDiscountPath)) {
        activeDiscounts = JSON.parse(fs.readFileSync(activeDiscountPath));
      }
    } catch {}

    const userDiscount = activeDiscounts[userId];

    let statusVoucher = "";
    if (userDiscount) {
      statusVoucher = `
✅ <b>VOUCHER AKTIF</b>
🎟️ Kode: <code>${userDiscount.code}</code>
📉 Diskon: <b>${userDiscount.percent}%</b>
⚡ Status: <b>Siap Digunakan</b>`;
    } else {
      statusVoucher = `
❌ <b>TIDAK ADA VOUCHER</b>
Anda belum mengklaim voucher.`;
    }

    const caption = `
🎟️ <b>MENU VOUCHER</b>

${statusVoucher}

💰 <b>KEUNTUNGAN VOUCHER</b>
• Potongan harga langsung
• Berlaku semua transaksi
• Mudah digunakan

🎯 <b>CARA DAPATKAN</b>
1. Owner membuat voucher
2. Bagikan kode ke user
3. Klaim dengan /claim KODE
`;

    const keyboard = {
      inline_keyboard: [
        [{ text: "🔙 Kembali", callback_data: "back_home" }]
      ]
    };

    await bot.editMessageMedia(
      {
        type: "photo",
        media: config.ppthumb,
        caption: caption,
        parse_mode: "HTML"
      },
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard
      }
    ).catch(async () => {
      await bot.editMessageCaption(caption, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: keyboard
      });
    });
  }
});

// ======================= 🌍 /PUBLIC =======================
bot.onText(/^\/public$/i, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();  
      if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "Markdown" }
      );
    }

    // 📂 Baca status mode sekarang
    let currentMode = { self: false };
    if (fs.existsSync(modeFile)) {
      try {
        currentMode = JSON.parse(fs.readFileSync(modeFile, "utf8"));
      } catch {
        currentMode = { self: false };
      }
    }

    // ⚠️ Jika sudah mode public
    if (currentMode.self === false) {
      return bot.sendMessage(
        chatId,
        "⚠️ Mode *Public* sudah aktif sebelumnya!\nTidak perlu diaktifkan lagi.",
        { parse_mode: "Markdown" }
      );
    }

    // ✅ Aktifkan mode public
    fs.writeFileSync(modeFile, JSON.stringify({ self: false }, null, 2));
    await bot.sendMessage(
      chatId,
      "🌍 Mode *Public* diaktifkan!\nSekarang semua user dapat menggunakan bot.",
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    logError(err, "/public");
  }
});
// ======================= ⚙️ /JOINCH =======================
bot.onText(/^\/joinch(?:\s*(on|off))?$/i, async (msg, match) => {
  try {
    const userId = msg.from.id.toString();
    const chatId = msg.chat.id;
    const arg = match[1];
  
      if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "Markdown" }
      );
    }

    // =======================
    // 📌 FIX JSON AUTO-REPAIR
    // =======================
    let current = { status: false };

    try {
      const raw = fs.readFileSync(joinChFile, "utf8").trim();

      if (!raw) {
        fs.writeFileSync(joinChFile, JSON.stringify(current, null, 2));
      } else {
        current = JSON.parse(raw);
      }

    } catch (err) {
      current = { status: false };
      fs.writeFileSync(joinChFile, JSON.stringify(current, null, 2));
    }

    const currentStatus = current.status ? "Aktif ✅" : "Nonaktif ❌";

    // ❓ Jika tanpa argumen → tampilkan status
    if (!arg) {
      const helpMsg = `
🔐 *WAJIB JOIN CHANNEL*

Status saat ini: *${currentStatus}*

Gunakan perintah:
• \`/joinch on\`  → Aktifkan wajib join channel
• \`/joinch off\` → Matikan wajib join channel
`;
      return bot.sendMessage(chatId, helpMsg, { parse_mode: "Markdown" });
    }

    // 🔄 Ubah status
    const status = arg.toLowerCase() === "on";
    fs.writeFileSync(joinChFile, JSON.stringify({ status }, null, 2));

    const pesan = `🔐 Fitur *wajib join channel* sekarang ${status ? "*aktif*" : "*nonaktif*"}!`;
    await bot.sendMessage(chatId, pesan, { parse_mode: "Markdown" });

  } catch (err) {
    logError(err, "/joinch");
  }
});
// ======================= ⚙️ /MAINTENANCE =======================
bot.onText(/^\/maintenance(?:\s*(on|off))?$/i, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const arg = match[1];
    const userId = msg.from.id.toString();
  
      if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "Markdown" }
      );
    }

    // 🔧 Lokasi file
    const maintenanceFile = path.join(__dirname, "./database/maintenance.json");

    // ============================
    // 📌 AUTO-REPAIR JSON (ANTI ERROR)
    // ============================
    let current = { status: false };

    try {
      const raw = fs.readFileSync(maintenanceFile, "utf8").trim();

      if (!raw) {
        // Jika kosong → tulis default
        fs.writeFileSync(maintenanceFile, JSON.stringify(current, null, 2));
      } else {
        current = JSON.parse(raw);
      }
    } catch (e) {
      // Jika rusak → reset ulang
      current = { status: false };
      fs.writeFileSync(maintenanceFile, JSON.stringify(current, null, 2));
    }

    const currentStatus = current.status ? "Aktif ✅" : "Nonaktif ❌";

    // ❓ Jika tanpa argumen → tampilkan status
    if (!arg) {
      const helpMsg = `
🛠️ *MAINTENANCE MODE*

Status saat ini: *${currentStatus}*

Gunakan perintah berikut:
• \`/maintenance on\`  → Aktifkan mode maintenance
• \`/maintenance off\` → Nonaktifkan mode maintenance
`;
      return bot.sendMessage(chatId, helpMsg, { parse_mode: "Markdown" });
    }

    // 🔄 Ubah status
    const status = arg.toLowerCase() === "on";
    fs.writeFileSync(maintenanceFile, JSON.stringify({ status }, null, 2));

    await bot.sendMessage(
      chatId,
      `⚙️ Maintenance mode ${status ? "*aktif*" : "*nonaktif*"}!`,
      { parse_mode: "Markdown" }
    );

  } catch (err) {
    logError(err, "/maintenance");
  }
});
// ======================= ⚙️ /GROUPONLY =======================
bot.onText(/^\/grouponly(?:\s*(on|off))?$/i, async (msg, match) => {
  try {
    const arg = match[1];
    const chatId = msg.chat.id;
    // ✅ Cek owner
    const userId = msg.from.id.toString();  
      if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "Markdown" }
      );
    }

    // 📂 Lokasi file penyimpanan
    const groupOnlyFile = path.join(__dirname, "./database/grouponly.json");
    if (!fs.existsSync(groupOnlyFile)) fs.writeFileSync(groupOnlyFile, JSON.stringify({ status: false }));

    const current = JSON.parse(fs.readFileSync(groupOnlyFile, "utf8"));
    const currentStatus = current.status ? "Aktif ✅" : "Nonaktif ❌";

    // ❓ Jika tanpa argumen → tampilkan tutorial
    if (!arg) {
      const helpMsg = `
⚙️ *GROUP ONLY MODE*

Status saat ini: *${currentStatus}*

Gunakan perintah berikut untuk mengubah mode:
• \`/grouponly on\`  → Aktifkan mode grup-only (bot hanya merespon di grup)
• \`/grouponly off\` → Nonaktifkan mode grup-only (bot bisa digunakan di semua chat)
`;
      return bot.sendMessage(chatId, helpMsg, { parse_mode: "Markdown" });
    }

    // 🔄 Ubah status sesuai argumen
    const status = arg.toLowerCase() === "on";
    fs.writeFileSync(groupOnlyFile, JSON.stringify({ status }));

    const pesan = `👥 GroupOnly mode ${status ? "*aktif*" : "*nonaktif*"}!\nSekarang bot ${
      status ? "tidak merespon chat private" : "bisa digunakan di semua tempat"
    }.`;

    await bot.sendMessage(chatId, pesan, { parse_mode: "Markdown" });
  } catch (err) {
    logError(err, "/grouponly");
  }
});

// ====================== ⚫ /BL & /BLACKLIST (Owner Only) ======================
bot.onText(/^\/(?:bl|blacklist|bluser)(?:\s+(.*))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
    const userId = msg.from.id.toString();  
      if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "Markdown" }
      );
    }

  // ⚙️ Jika tidak ada argumen → kirim tutorial penggunaan
  if (!match[1]) {
    const tutorial = `
📝 *Cara Menambahkan Blacklist:*

Gunakan format:
\`/bl <user_id>, <alasan>\`

📌 *Contoh:*
\`/bl 123456789, Melanggar aturan bot\`

Perintah ini akan menambahkan user ke daftar blacklist dan mereka tidak bisa menggunakan bot lagi.
`;
    return bot.sendMessage(chatId, tutorial, { parse_mode: "Markdown" });
  }

  // 🧩 Parsing argumen
  const args = match[1].split(",");
  if (args.length < 2) {
    return bot.sendMessage(chatId, "❌ Format salah!\nGunakan format: `/bl <user_id>, <alasan>`", { parse_mode: "Markdown" });
  }

  const targetId = args[0].trim();
  const alasan = args.slice(1).join(",").trim();

  const blacklistFile = path.join(__dirname, "./database/blacklist.json");

  // 📁 Buat file jika belum ada
  if (!fs.existsSync(blacklistFile)) fs.writeFileSync(blacklistFile, JSON.stringify([], null, 2));

  let blacklist = JSON.parse(fs.readFileSync(blacklistFile, "utf8"));
  const sudahAda = blacklist.find((u) => u.id === targetId);

  if (sudahAda) {
    return bot.sendMessage(chatId, `⚠️ User \`${targetId}\` sudah ada di daftar blacklist.`, { parse_mode: "Markdown" });
  }

  // 🧾 Tambahkan ke blacklist
  blacklist.push({
    id: targetId,
    alasan,
    waktu: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
  });
  fs.writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2));

  const teks = `
🚫 *BLACKLIST DITAMBAHKAN!*

👤 *User ID:* \`${targetId}\`
📋 *Alasan:* ${alasan}
🕐 *Waktu:* ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}

User ini tidak dapat menggunakan bot lagi.
`;

  await bot.sendMessage(chatId, teks, { parse_mode: "Markdown" });
});

// ====================== ⚪ /UNBL & /UNBLACKLIST (Owner Only) ======================
bot.onText(/^\/(?:unbl|unblacklist|unbluser)(?:\s+(.*))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
    const userId = msg.from.id.toString();  
      if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "Markdown" }
      );
    }

  // ⚙️ Jika tidak ada argumen → kirim tutorial penggunaan
  if (!match[1]) {
    const tutorial = `
📝 *Cara Menghapus Blacklist:*

Gunakan format:
\`/unbl <user_id>\`

📌 *Contoh:*
\`/unbl 123456789\`

Perintah ini akan menghapus user dari daftar blacklist, sehingga mereka dapat menggunakan bot lagi.
`;
    return bot.sendMessage(chatId, tutorial, { parse_mode: "Markdown" });
  }

  // 🧩 Parsing argumen
  const targetId = match[1].trim();
  const blacklistFile = path.join(__dirname, "./database/blacklist.json");

  // 📁 Pastikan file ada
  if (!fs.existsSync(blacklistFile)) {
    return bot.sendMessage(chatId, "❌ File *blacklist.json* belum ada atau kosong.", { parse_mode: "Markdown" });
  }

  let blacklist = JSON.parse(fs.readFileSync(blacklistFile, "utf8"));

  // 🔍 Cek apakah user ada di daftar blacklist
  const index = blacklist.findIndex((u) => String(u.id) === String(targetId));
  if (index === -1) {
    return bot.sendMessage(chatId, `ℹ️ User \`${targetId}\` tidak ditemukan di daftar blacklist.`, { parse_mode: "Markdown" });
  }

  const removedUser = blacklist[index];
  blacklist.splice(index, 1);
  fs.writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2));

  const teks = `
✅ *BLACKLIST DIHAPUS!*

👤 *User ID:* \`${targetId}\`
📋 *Alasan Sebelumnya:* ${removedUser.alasan || "Tidak disebutkan"}
🕐 *Diblacklist Pada:* ${removedUser.waktu || "Tidak diketahui"}

User ini sekarang sudah bisa menggunakan bot kembali.
`;

  await bot.sendMessage(chatId, teks, { parse_mode: "Markdown" });
});

// =====================================================
// 💰 FITUR MANUAL: /addsaldo idUser nominal
// Hanya Owner yang bisa akses + auto tutorial + notifikasi lengkap
// =====================================================
bot.onText(/^\/addsaldo(?:\s+(\d+))?(?:\s+(\d+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;

  const fs = require("fs");  
  const fromId = msg.from.id.toString();  
      if (await guardAll(msg)) return;

  // 🔐 Hanya owner
  if (fromId !== config.OWNER_ID.toString()) {
    return bot.sendMessage(chatId, "❌ Kamu tidak punya akses ke perintah ini.");
  }

  const id = match[1];        // user id
  const jumlah = parseInt(match[2]);  // nominal

  // 📌 Jika argumen tidak lengkap → tampilkan tutorial
  if (!id || !jumlah) {
    return bot.sendMessage(
      chatId,
      `❗ *Cara Pakai Perintah /addsaldo*\n\nFormat:\n\`/addsaldo <id_user> <nominal>\`\n\nContoh:\n\`/addsaldo 8333063872 5000\`\n\n• ID user adalah ID Telegram pembeli.\n• Nominal harus berupa angka tanpa titik.\n`,
      { parse_mode: "Markdown" }
    );
  }

  if (isNaN(jumlah) || jumlah <= 0) {
    return bot.sendMessage(chatId, "❌ Nominal harus berupa angka lebih dari 0.");
  }

  const saldoPath = "./database/saldoOtp.json";

  // Pastikan file ada
  if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}, null, 2));

  // Baca file saldo
  let saldoData = JSON.parse(fs.readFileSync(saldoPath, "utf8"));
  let before = saldoData[id] || 0;

  // Tambah saldo
  saldoData[id] = before + jumlah;

  // Simpan file
  fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

  const after = saldoData[id];

  // ============================
  // 🔔 NOTIFIKASI 1 — ke Admin (yang mengetik perintah)
  // ============================
  const teks = `✅ Saldo user \`${id}\` ditambah *Rp${toRupiah(jumlah)}*\n\n💵 Sebelumnya: Rp${toRupiah(before)}\n💼 Total Sekarang: Rp${toRupiah(after)}`;
  bot.sendMessage(chatId, teks, { parse_mode: 'Markdown' });

  // ============================
  // 🔔 NOTIFIKASI 2 — ke User yang ditambah saldonya
  // ============================
  bot.sendMessage(
    id,
    `🎉 *Saldo Anda telah berhasil ditambahkan!*\n\n💵 Sebelumnya: *Rp${toRupiah(before)}*\n➕ Tambahan: *Rp${toRupiah(jumlah)}*\n💼 Total Sekarang: *Rp${toRupiah(after)}*`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});

  // ============================
  // 🔔 NOTIFIKASI 3 — ke OWNER sebagai log
  // ============================
  bot.sendMessage(
    config.OWNER_ID,
    `📢 *NOTIFIKASI ADD SALDO*\n\n👤 Admin: @${msg.from.username || msg.from.first_name}\n🆔 ID Admin: \`${msg.from.id}\`\n\n➕ Menambah saldo ke ID \`${id}\` sebesar *Rp${toRupiah(jumlah)}*\n💵 Sebelumnya: *Rp${toRupiah(before)}*\n💼 Total: *Rp${toRupiah(after)}*`,
    { parse_mode: 'Markdown' }
  );
});
// =====================================================
// ❌ FITUR MANUAL: /delsaldo idUser nominal
// Hanya Owner + auto tutorial + notifikasi lengkap
// =====================================================
bot.onText(/^\/delsaldo(?:\s+(\d+))?(?:\s+(\d+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;

  const fs = require("fs");  
  const fromId = msg.from.id.toString();  
      if (await guardAll(msg)) return;

  // 🔐 Hanya owner
  if (fromId !== config.OWNER_ID.toString()) {
    return bot.sendMessage(chatId, "❌ Kamu tidak punya akses ke perintah ini.");
  }

  const id = match[1];             // user id
  const jumlah = parseInt(match[2]); // nominal

  // 📌 Jika argumen tidak lengkap → tampilkan tutorial
  if (!id || !jumlah) {
    return bot.sendMessage(
      chatId,
      `❗ *Cara Pakai Perintah /delsaldo*\n\nFormat:\n\`/delsaldo <id_user> <nominal>\`\n\nContoh:\n\`/delsaldo 8333063872 5000\`\n\n• ID user adalah ID Telegram pembeli.\n• Nominal harus berupa angka tanpa titik.\n`,
      { parse_mode: "Markdown" }
    );
  }

  if (isNaN(jumlah) || jumlah <= 0) {
    return bot.sendMessage(chatId, "❌ Nominal harus berupa angka lebih dari 0.");
  }

  const saldoPath = "./database/saldoOtp.json";

  // Pastikan file saldo ada
  if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}, null, 2));

  // Baca saldo
  let saldoData = JSON.parse(fs.readFileSync(saldoPath, "utf8"));
  let before = saldoData[id] || 0;

  // Cek apakah saldo cukup
  if (before < jumlah) {
    return bot.sendMessage(
      chatId,
      `❌ Saldo user tidak mencukupi!\n\n💵 Saldo saat ini: *Rp${toRupiah(before)}*\n➖ Yang ingin dikurangi: *Rp${toRupiah(jumlah)}*`,
      { parse_mode: "Markdown" }
    );
  }

  // Kurangi saldo
  saldoData[id] = before - jumlah;

  // Simpan file
  fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

  const after = saldoData[id];

  // ============================
  // 🔔 NOTIFIKASI 1 — ke Admin (yang mengetik perintah)
  // ============================
  const teks = `❌ Saldo user \`${id}\` dikurangi *Rp${toRupiah(jumlah)}*\n\n💵 Sebelumnya: Rp${toRupiah(before)}\n💼 Total Sekarang: Rp${toRupiah(after)}`;
  bot.sendMessage(chatId, teks, { parse_mode: 'Markdown' });

  // ============================
  // 🔔 NOTIFIKASI 2 — ke User yang dikurangi saldonya
  // ============================
  bot.sendMessage(
    id,
    `⚠️ *Saldo Anda telah berhasil dikurangi!*\n\n💵 Sebelumnya: *Rp${toRupiah(before)}*\n➖ Pengurangan: *Rp${toRupiah(jumlah)}*\n💼 Total Sekarang: *Rp${toRupiah(after)}*`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});

  // ============================
  // 🔔 NOTIFIKASI 3 — ke OWNER sebagai log
  // ============================
  bot.sendMessage(
    config.OWNER_ID,
    `📢 *NOTIFIKASI DEL SALDO*\n\n👤 Admin: @${msg.from.username || msg.from.first_name}\n🆔 ID Admin: \`${msg.from.id}\`\n\n➖ Mengurangi saldo ID \`${id}\` sebesar *Rp${toRupiah(jumlah)}*\n💵 Sebelumnya: *Rp${toRupiah(before)}*\n💼 Total: *Rp${toRupiah(after)}*`,
    { parse_mode: 'Markdown' }
  );
});
// =====================================================
// 📋 LIST SEMUA SALDO USER + USERNAME
// =====================================================
bot.onText(/^\/listsaldo$/i, async (msg) => {
  const fs = require("fs");
  const saldoPath = "./database/saldoOtp.json";  
      if (await guardAll(msg)) return;

  if (!fs.existsSync(saldoPath)) {
    return bot.sendMessage(msg.chat.id, "❌ Data saldo tidak ditemukan.");
  }

  const saldoData = JSON.parse(fs.readFileSync(saldoPath, "utf8"));
  const entries = Object.entries(saldoData);

  if (entries.length === 0) {
    return bot.sendMessage(msg.chat.id, "📭 Belum ada data saldo.");
  }

  let teks = `📋 *DAFTAR SALDO USER*\n\n`;

  // Loop tiap user
  for (const [id, saldo] of entries) {
    let username = "(username tidak ditemukan)";

    try {
      const userInfo = await bot.getChat(id);
      if (userInfo.username) username = `@${userInfo.username}`;
      else if (userInfo.first_name) username = userInfo.first_name;
    } catch (e) {
      // User belum pernah chat bot → username tetap '(username tidak ditemukan)'
    }

    teks += `🆔 \`${id}\`\n👤 ${username}\n💰 Rp${toRupiah(saldo)}\n\n`;
  }

  bot.sendMessage(msg.chat.id, teks, { parse_mode: "Markdown" });
});
// ===========================================================
// 🔁 /broadcast & /bcbot — Forward pesan ke semua user bot
// ===========================================================
bot.onText(/^\/(broadcast|bcbot)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  
  const fs = require("fs");
  const fromId = msg.from.id.toString();
  const cmd = match[1];  
      if (await guardAll(msg)) return;

  if (fromId !== config.OWNER_ID.toString()) {
    return bot.sendMessage(chatId, "❌ Kamu tidak punya akses.");
  }

  // Harus reply
  if (!msg.reply_to_message) {
    return bot.sendMessage(
      chatId,
      `❗ *Reply pesan yang ingin di-forward, lalu ketik /${cmd}.*`,
      { parse_mode: "Markdown" }
    );
  }

  const userPath = "./users.json";

  if (!fs.existsSync(userPath)) {
    return bot.sendMessage(chatId, "❌ File users.json tidak ditemukan.");
  }

  let users;
  try {
    users = JSON.parse(fs.readFileSync(userPath, "utf8"));
  } catch {
    return bot.sendMessage(chatId, "❌ Gagal membaca users.json");
  }

  if (!Array.isArray(users) || users.length === 0) {
    return bot.sendMessage(chatId, "⚠️ Tidak ada user terdaftar.");
  }

  users = users.map(id => id.toString());

  let success = 0;
  let failed = 0;
  let failedIds = [];

  const startTime = Date.now();

  // Status awal
  const statusMsg = await bot.sendMessage(
    chatId,
    `🚀 Memulai broadcast...\n0% | 0/${users.length}`
  );

  const delay = 400;

  for (let i = 0; i < users.length; i++) {
    const uid = users[i];

    try {
      await bot.forwardMessage(uid, chatId, msg.reply_to_message.message_id);
      success++;
    } catch (err) {
      failed++;
      failedIds.push(uid.toString());
      console.log(`❌ Gagal kirim ke ID ${uid}: ${err.message}`);
    }

    const done = success + failed;

    // Update progress setiap 5 user
    if ((i + 1) % 5 === 0 || done === users.length) {
      const percent = Math.floor((done / users.length) * 100);

      const progress =
        `📢 *Broadcast Berjalan...*\n\n` +
        `🔄 PROSES: *${percent}%*\n` +
        `🎯 TARGET: \`${uid}\`\n` +
        `📊 PROGRESS: *${done}/${users.length}*\n\n` +
        `🟢 Berhasil: ${success}\n` +
        `🔴 Gagal: ${failed}`;

      await bot.editMessageText(progress, {
        chat_id: statusMsg.chat.id,
        message_id: statusMsg.message_id,
        parse_mode: "Markdown"
      });
    }

    await new Promise(r => setTimeout(r, delay));
  }

  // Hapus ID gagal
  if (failedIds.length > 0) {
    const updatedUsers = users.filter(id => !failedIds.includes(id));
    fs.writeFileSync(userPath, JSON.stringify(updatedUsers, null, 2));
    console.log("🔥 ID yang dihapus:", failedIds);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  const summary =
    `✅ *Broadcast Selesai!*\n\n` +
    `📬 *Total Target:* ${success + failed}\n` +
    `🟢 *Berhasil:* ${success}\n` +
    `🔴 *Gagal:* ${failed}\n` +
    `🗑 *ID gagal sudah dihapus dari users.json*\n` +
    `⏱ *Durasi:* ${duration} detik\n` +
    `📅 *Selesai:* ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`;

  await bot.sendMessage(chatId, summary, { parse_mode: "Markdown" });

  // ===========================================================
  // 🧹 AUTO DELETE STATUS PROGRESS (FIX UTAMA)
  // ===========================================================
  bot.deleteMessage(statusMsg.chat.id, statusMsg.message_id).catch(() => {});
});

// ===============================================
// 🔧 /setbackup <menit> — Atur Interval Auto-Backup
// Alias: /settime, /setautobackup
// ===============================================
bot.onText(/^\/(?:setbackup|settime|setautobackup)(?:\s+(\d+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;  
      if (await guardAll(msg)) return;
    // Hanya OWNER
    if (String(userId) !== String(config.OWNER_ID)) {
        return bot.sendMessage(chatId, "❌ Hanya Owner yang bisa mengatur interval backup.");
    }

    const minutes = Number(match[1]);
    const dataFile = "./database/lastAutoBackup.json";

    // ===========================
    // 📌 JIKA TANPA ANGKA → TAMPILKAN STATUS
    // ===========================
    if (!minutes) {
        const data = fs.existsSync(dataFile)
            ? JSON.parse(fs.readFileSync(dataFile, "utf8"))
            : {};

        const interval = data.interval_minutes || (backupManager.intervalMs / 60000);

        return bot.sendMessage(
            chatId,
            `📦 *PENGATURAN AUTO BACKUP*\n\n` +
            `⏱ Interval saat ini: *${interval} menit*\n` +
            `📁 Backup terakhir: *${data.last_backup || "-"}*\n` +
            `⏳ Backup selanjutnya: *${data.next_backup || "-"}*\n\n` +
            `Cara ubah interval:\n` +
            `\`/setbackup <menit>\`\n\n` +
            `Contoh:\n` +
            `• /setbackup 30\n` +
            `• /setbackup 120`,
            { parse_mode: "Markdown" }
        );
    }

    // ===========================
    // ❌ VALIDASI INPUT
    // ===========================
    if (minutes < 1) {
        return bot.sendMessage(chatId, "❌ Minimal interval adalah 1 menit.");
    }

    // ===========================
    // ✔ SIMPAN INTERVAL BARU
    // ===========================
    backupManager.setIntervalMinutes(minutes);

    // ===========================
    // 🔁 RESTART INTERVAL TIMER
    // ===========================
    backupManager.startAutoBackup();

    // ===========================
    // ✔️ NOTIFIKASI
    // ===========================
    return bot.sendMessage(
        chatId,
        `✅ Interval auto-backup berhasil diubah menjadi *${minutes} menit*!`,
        { parse_mode: "Markdown" }
    );
});
// ============================================================
// 📦 BACKUP SYSTEM — NDY OFFICIAL STYLE (FINAL FIX V3)
// ✔ Backup folder + file campuran (support spasi)
// ============================================================
bot.onText(/^\/backup$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const OWNER_ID = config.OWNER_ID;
  
      if (await guardAll(msg)) return;
  // Akses hanya untuk Owner
  if (userId !== OWNER_ID.toString()) {
    return bot.sendMessage(chatId, "❌ *Akses ditolak!* Hanya Owner.", {
      parse_mode: "Markdown",
      reply_to_message_id: msg.message_id
    });
  }

  // Folder yang ingin di-backup
  const foldersToBackup = [
    "./database",
    "./ALL TUTOR"
  ];

  // File yang ingin di-backup
  const filesToBackup = [
    "./config.js",
    "./settings.js",
    "./package.json",
    "./sessioncs.json",
    "./users.json",
    "./index.js"
  ];

  const backupName = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const backupPath = path.join(__dirname, backupName);

  // Pesan loading backup
  const loadingMsg = await bot.sendMessage(
    chatId,
    "⏳ *Sedang membuat backup...*\nMohon tunggu sebentar.",
    { parse_mode: "Markdown" }
  );

  try {
    const output = fs.createWriteStream(backupPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);

    // Tambahkan folder (fix spasi dengan resolve)
    for (const folder of foldersToBackup) {
      if (fs.existsSync(folder)) {
        archive.directory(path.resolve(folder), path.basename(folder));
      }
    }

    // Tambahkan file
    for (const file of filesToBackup) {
      if (fs.existsSync(file)) {
        archive.file(file, { name: path.basename(file) });
      }
    }

    await archive.finalize();

    output.on("close", async () => {
      const sizeMB = (output.bytesWritten / 1024 / 1024).toFixed(2);

      // Hapus pesan loading
      bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

      // Kirim file ZIP
      await bot.sendDocument(chatId, backupPath, {
        caption: `📦 *BACKUP BERHASIL!*
🗂️ File: \`${backupName}\`
💾 Size: *${sizeMB} MB*

— NDY Backup System`,
        parse_mode: "Markdown"
      });

      // Hapus ZIP setelah terkirim
      fs.unlinkSync(backupPath);

      // Log ke Owner
      bot.sendMessage(
        OWNER_ID,
        `🛡️ *Backup Log*\nBackup berhasil dibuat.\n📁 File: \`${backupName}\``,
        { parse_mode: "Markdown" }
      );
    });

  } catch (err) {
    console.error(err);
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    bot.sendMessage(chatId, "❌ *Gagal membuat backup.*", { parse_mode: "Markdown" });
  }
});
// ==============================================
// ✍️ USER MENGIRIM ULASAN
// ==============================================
bot.on("message", async (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  // Cek apakah user sedang dalam proses memberi ulasan
  if (!global.tempRating || !global.tempRating[userId]) return;
  if (msg.text.startsWith("/") || msg.text.startsWith(".")) return;

  const ratingData = global.tempRating[userId];
  delete global.tempRating[userId];

  // Hapus pesan rating sebelumnya
  if (ratingData.messageId) {
    bot.deleteMessage(chatId, ratingData.messageId).catch(() => {});
  }

  const reviewText = msg.text;
  const rateFile = "./database/ratingNokos.json";
  const channellog = config.idchannel; // channel rating

  const finalData = {
    userId,
    userName: msg.from.first_name,
    username: msg.from.username || "-",
    orderId: ratingData.orderId,
    rating: ratingData.rating,
    review: reviewText,
    date: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
  };

  // Simpan ke database
  let list = [];
  try {
    if (fs.existsSync(rateFile)) {
      list = JSON.parse(fs.readFileSync(rateFile, "utf-8"));
    }
  } catch {}
  list.push(finalData);
  fs.writeFileSync(rateFile, JSON.stringify(list, null, 2));

  // Kirim ke user
  await bot.sendMessage(
    chatId,
    `🎉 *Terima kasih atas ulasan Anda!*

⭐ Rating: *${finalData.rating}/5*
💬 *Ulasan Anda:*
_${finalData.review}_

📌 Ulasan berhasil disimpan.`,
    { parse_mode: "Markdown" }
  );

  // ================================
  // 🔊 KIRIM KE CHANNEL
  // ================================
  if (channellog && channellog !== "0") {
    const chTxt = `
⭐ *Rating Baru Masuk*

🆔 *Order ID:* \`${finalData.orderId}\`
⭐ *Rating:* ${finalData.rating}/5
💬 *Ulasan:* 
_${finalData.review}_

👤 *User:*
• Nama: ${finalData.userName}
• ID Telegram: \`${finalData.userId}\`
• Username: @${finalData.username}

📆 *Tanggal:* ${finalData.date}
`;

    bot.sendMessage(channellog, chTxt, { parse_mode: "Markdown" })
      .catch((e) => console.error("Gagal kirim rating ke channel:", e.message));
  }
});
// ====================================================
// 🧠 AUTO RESTART (ANTI HANG)
// ====================================================
setInterval(() => {
  const used = process.memoryUsage().heapUsed / 1024 / 1024;
  if (used > 500) {
    console.log("⚠️ Memory tinggi, restart otomatis...");
    process.exit(1);
  }
}, 30000);

//##################################//

bot.getMe().then(async () => {
  console.clear();

  const developer = config.authorName;
  const botversion = config.version;

  // 🌌 Tampilan Cyber Boot Logo (WOW Style)
  console.log(chalk.cyanBright(`
⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠳⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣀⡴⢧⣀⠀⠀⣀⣠⠤⠤⠤⠤⣄⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠘⠏⢀⡴⠊⠁⠀⠀⠀⠀⠀⠀⠈⠙⠦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⣰⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢶⣶⣒⣶⠦⣤⣀⠀
⠀⠀⠀⠀⠀⠀⢀⣰⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣟⠲⡌⠙⢦⠈⢧
⠀⠀⠀⣠⢴⡾⢟⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⡴⢃⡠⠋⣠⠋
⠐⠀⠞⣱⠋⢰⠁⢿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⠤⢖⣋⡥⢖⣫⠔⠋
⠈⠠⡀⠹⢤⣈⣙⠚⠶⠤⠤⠤⠴⠶⣒⣒⣚⣩⠭⢵⣒⣻⠭⢖⠏⠁⢀⣀
⠠⠀⠈⠓⠒⠦⠭⠭⠭⣭⠭⠭⠭⠭⠿⠓⠒⠛⠉⠉⠀⠀⣠⠏⠀⠀⠘⠞
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠓⢤⣀⠀⠀⠀⠀⠀⠀⣀⡤⠞⠁⠀⣰⣆⠀
⠀⠀⠀⠀⠀⠘⠿⠀⠀⠀⠀⠀⠈⠉⠙⠒⠒⠛⠉⠁⠀⠀⠀⠉⢳⡞⠉
`));
  console.log(chalk.bold.white("        𝐍𝐃𝐘𝐙 - 𝐎𝐅𝐅𝐂\n"));
  console.log(chalk.white.bold("DEVELOPER    : ") + chalk.cyan(developer));
  console.log(chalk.white.bold("VERSION      : ") + chalk.green(botversion));
  console.log(chalk.greenBright("\nBot Berhasil Tersambung [✓]\n"));

  // 🔔 Kirim notifikasi ke owner
  bot.sendMessage(config.OWNER_ID, "*✅ Bot Telegram Berhasil Tersambung!*", { parse_mode: "Markdown" });

});

// ==================== ⚡ SYSTEM LOG : USER COMMAND DETECTED (CYBER NDY EDITION) ====================
bot.on("message", async (msg) => {
  try {
    if (!msg.text || !msg.from) return;
    const text = msg.text.trim();

    // Hanya notif untuk command "/"
    if (!text.startsWith("/")) return;

    const command = text.split(" ")[0].toLowerCase();
    const userId = msg.from.id.toString();
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
    const fullName = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();
    const fiturDipakai = command;

    const moment = require("moment-timezone");
    const waktu = moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm:ss");

    const chatType =
      msg.chat.type === "private"
        ? "📩 Private Chat"
        : msg.chat.title
        ? `👥 Group: *${msg.chat.title}*`
        : "🌐 Unknown Zone";

    const locationInfo =
      msg.chat.type === "private"
        ? "📩 Mode     : *Private Chat*"
        : `👥 Grup     : *${msg.chat.title}*\n┃ 🆔 Group ID : \`${msg.chat.id}\``;

    // Skip notif untuk owner
    if (userId === config.OWNER_ID.toString()) return;

    const notifText = `
╔═ 𓆩⚡𓆪 𝗨𝗦𝗘𝗥 𝗕𝗔𝗥𝗨 𝗗𝗘𝗧𝗘𝗖𝗧𝗘𝗗 𓆩⚡𓆪 ═╗

📥 *Seseorang baru saja mengakses bot!*

┣━〔 👤 PROFIL 〕
┃ 🧍 Nama     : *${fullName}*
┃ 🔗 Username : ${msg.from.username ? `[@${msg.from.username}](https://t.me/${msg.from.username})` : "Tidak tersedia"}
┃ 🆔 User ID  : \`${msg.from.id}\`
┃ 🕐 Waktu    : ${waktu}
┃ 📡 Status   : *LIVE CONNECTED*
┃ ${locationInfo.split("\n").join("\n┃ ")}
┃ 💬 *Command:* \`${fiturDipakai}\`

┣━〔 ⚙️ SYSTEM LOG 〕
┃ 🤖 Bot     : ${config.botName}
┃ 🔋 Mode    : Public + Real-Time
┃ 🚀 Access  : Premium Service
┃ 🧠 Logger  : Aktif ✅
┃ 🛰️ Channel : ${chatType}

╚ ✦ SYSTEM ALERT ManzzyID OFFICIAL  2025 ✦ ╝`;

    await bot.sendMessage(config.OWNER_ID, notifText, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("❌ Gagal kirim notif ke owner:", err);
  }
});

let smmSession = {};
let cachedServices = null;

async function callSmmApi(path, params = {}) {
  try {
    const postData = new URLSearchParams();
    postData.append('api_id', config.SMM_API_ID);
    postData.append('api_key', config.SMM_API_KEY);
    
    for (const key in params) {
      postData.append(key, params[key]);
    }

    const res = await axios.post(`${config.SMM_BASE_URL}${path}`, postData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data;
  } catch (e) {
    return { status: false, data: e.message };
  }
}

bot.on("callback_query", async (cb) => {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const userId = cb.from.id.toString();
    const config = require("./config.js");
    const fs = require("fs");

    if (!data.startsWith("store_script_") && !data.startsWith("sc_detail_") && !data.startsWith("sc_buy_")) {
        return; 
    }

    if (await guardAll(cb.message)) return;

    if (data === "store_script_menu" || data.startsWith("store_script_page_")) {
        const scriptPath = "./database/storeScript.json";
        let scripts = [];
        try {
            if (fs.existsSync(scriptPath)) scripts = JSON.parse(fs.readFileSync(scriptPath));
        } catch {}

        if (scripts.length === 0) {
            return bot.answerCallbackQuery(cb.id, { text: "⚠️ Belum ada produk script yang tersedia.", show_alert: true });
        }

        let page = 0;
        if (data.startsWith("store_script_page_")) {
            page = parseInt(data.split("_")[3]);
        }

        const limit = 5;
        const totalPages = Math.ceil(scripts.length / limit);
        
        if (page < 0) page = 0;
        if (page >= totalPages) page = totalPages - 1;

        const start = page * limit;
        const end = start + limit;
        const scriptList = scripts.slice(start, end);

        let caption = `🗂️ *STORE SCRIPT BOT*\n\nSilakan pilih script yang tersedia:\n📄 *Halaman ${page + 1}/${totalPages}*\n📦 *Total Script:* ${scripts.length}\n`;
        const keyboard = [];

        scriptList.forEach((sc) => {
            keyboard.push([{ 
                text: `${sc.name} - Rp${sc.price.toLocaleString("id-ID")}`, 
                callback_data: `sc_detail_${sc.id}` 
            }]);
        });

        const navButtons = [];
        if (page > 0) {
            navButtons.push({ text: "⬅️ Prev", callback_data: `store_script_page_${page - 1}` });
        }
        
        navButtons.push({ text: `📑 ${page + 1}/${totalPages}`, callback_data: "noop" });

        if (page < totalPages - 1) {
            navButtons.push({ text: "Next ➡️", callback_data: `store_script_page_${page + 1}` });
        }
        keyboard.push(navButtons);

        keyboard.push([{ text: "🔙 Kembali Menu Utama", callback_data: "back_home" }]);

        await bot.editMessageCaption(caption, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        }).catch(async () => {
             await bot.editMessageMedia(
                { type: "photo", media: config.ppthumb, caption: caption, parse_mode: "Markdown" },
                { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } }
            );
        });
        await bot.answerCallbackQuery(cb.id);
    }

    if (data.startsWith("sc_detail_")) {
        const scId = data.split("_")[2];
        const scriptPath = "./database/storeScript.json";
        const scripts = JSON.parse(fs.readFileSync(scriptPath));
        const sc = scripts.find(x => x.id === scId);
    
        if (!sc) return bot.answerCallbackQuery(cb.id, { text: "❌ Script tidak ditemukan/sudah dihapus.", show_alert: true });
    
        const caption = `
📄 *DETAIL SCRIPT*

📦 *Nama:* ${sc.name}
💰 *Harga:* Rp${sc.price.toLocaleString("id-ID")}
📝 *Deskripsi:*
_${sc.desc}_

📂 *File:* ${sc.fileName}
📅 *Diupload:* ${sc.uploadedAt}
🆔 *ID:* \`${sc.id}\`

Klik tombol di bawah untuk membeli file ini otomatis.
`;
    
        const keyboard = [
            [{ text: "💳 Beli Sekarang", callback_data: `sc_buy_${scId}` }],
            [{ text: "🔙 Kembali ke List", callback_data: "store_script_menu" }]
        ];
    
        await bot.editMessageCaption(caption, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        });
        await bot.answerCallbackQuery(cb.id);
    }

    if (data.startsWith("sc_buy_")) {
        const scId = data.split("_")[2];
        const scriptPath = "./database/storeScript.json";
        const saldoPath = "./database/saldoOtp.json";
        
        const scripts = JSON.parse(fs.readFileSync(scriptPath));
        const sc = scripts.find(x => x.id === scId);
        
        if (!sc) return bot.answerCallbackQuery(cb.id, { text: "❌ Produk tidak valid.", show_alert: true });
    
        let saldoData = JSON.parse(fs.readFileSync(saldoPath));
        const userSaldo = saldoData[userId] || 0;

        const { finalPrice, discountAmount, code, percent } = applyDiscount(userId, sc.price);
    
        if (userSaldo < finalPrice) {
            return bot.answerCallbackQuery(cb.id, { text: `❌ Saldo kurang! Bayar: Rp${finalPrice.toLocaleString("id-ID")}`, show_alert: true });
        }
    
        await bot.deleteMessage(chatId, messageId).catch(()=>{});
        const loadingMsg = await bot.sendMessage(chatId, "⏳ Mengirim file...", { parse_mode: "Markdown" });
    
        saldoData[userId] = userSaldo - finalPrice;
        fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

        if (code) useDiscount(userId);
    
        try {
            await bot.sendDocument(chatId, sc.fileId, {
                caption: `✅ *BELI SCRIPT BERHASIL*\n\n📦 ${sc.name}\n💰 Harga: Rp${sc.price.toLocaleString("id-ID")}\n?? Diskon ${percent}%: -Rp${discountAmount.toLocaleString("id-ID")}\n💵 Bayar: Rp${finalPrice.toLocaleString("id-ID")}`,
                parse_mode: "Markdown"
            });
            await bot.deleteMessage(chatId, loadingMsg.message_id).catch(()=>{});

            if (config.idchannel) {
                const strukChannel = `
✅ *PEMBELIAN SCRIPT SUKSES*
━━━━━━━━━━━━━━━━━━━━━
👤 *Buyer:* ${cb.from.first_name}
🆔 *ID:* \`${userId}\`
🔗 *Username:* @${cb.from.username || "-"}

📦 *Nama Script:* ${sc.name}
💰 *Harga Awal:* Rp${sc.price.toLocaleString("id-ID")}
📉 *Potongan:* Rp${discountAmount.toLocaleString("id-ID")}
💵 *Total Bayar:* Rp${finalPrice.toLocaleString("id-ID")}

📅 *Tanggal:* ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
━━━━━━━━━━━━━━━━━━━━━
`;
                await bot.sendMessage(config.idchannel, strukChannel, { parse_mode: "Markdown" }).catch((err) => {
                    console.log("Gagal kirim struk SC ke channel:", err.message);
                });
            }

        } catch (err) {
            saldoData[userId] += finalPrice;
            fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));
            bot.sendMessage(chatId, "❌ Gagal kirim file (File ID mungkin rusak). Saldo telah dikembalikan.");
            console.error(err);
        }
    }
});

bot.on('callback_query', async (query) => {
  try {
    const { data, message } = query;
    const chatId = message.chat.id;
    const userId = query.from.id.toString();
    const messageId = message.message_id;

        if (data === 'smm_menu_utama') {
        const saldoPath = path.join(__dirname, "./database/saldoOtp.json");
        const smmHistoryPath = path.join(__dirname, "./database/smmHistory.json");
        let userSaldo = 0;
        try {
            if (fs.existsSync(saldoPath)) {
                const saldoData = JSON.parse(fs.readFileSync(saldoPath));
                userSaldo = saldoData[userId] || 0;
            }
        } catch (e) {
            console.log("Gagal baca saldo SMM Menu:", e);
        }

        const caption = `🚀 *SUNTIK SOSMED MENU*\n\n👤 User: ${query.from.first_name}\n🆔 ID: \`${userId}\`\n💰 Saldo: *Rp ${userSaldo.toLocaleString("id-ID")}*\n\nSilakan pilih menu di bawah ini:`;
        
        const keyboard = [
            [{ text: "🛒 Daftar Layanan", callback_data: "smm_list_cat_0" }],
            [
              { text: "📦 Cek Status Order", callback_data: "smm_check_status" },
              { text: "📜 Riwayat Order", callback_data: "smm_history_page_1" }
            ],
            [{ text: "🔙 Kembali", callback_data: "back_home" }]
        ];
        
        await bot.editMessageMedia({ type: 'photo', media: config.ppthumb, caption: caption, parse_mode: 'Markdown' }, 
            { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } }
        ).catch(() => {});
    }


    if (data.startsWith('smm_list_cat_')) {
        await bot.answerCallbackQuery(query.id, { text: "🔄 Mengambil data..." });
        
        if (!cachedServices) {
            const res = await callSmmApi('/services');
            if (!res.status || !res.services) {
                return bot.sendMessage(chatId, "❌ Gagal mengambil data layanan dari server pusat.");
            }
            cachedServices = res.services;
        }

        const page = parseInt(data.split('_')[3]);
        const categories = [...new Set(cachedServices.map(s => s.category))];
        
        const perPage = 10;
        const totalPages = Math.ceil(categories.length / perPage);
        const start = page * perPage;
        const currentCats = categories.slice(start, start + perPage);

        const buttons = currentCats.map((cat) => {
            const globalIndex = categories.indexOf(cat);
            return [{ text: cat, callback_data: `smm_select_cat:${globalIndex}:0` }];
        });

        const nav = [];
        if (page > 0) nav.push({ text: "⬅️ Prev", callback_data: `smm_list_cat_${page - 1}` });
        if (page < totalPages - 1) nav.push({ text: "Next ➡️", callback_data: `smm_list_cat_${page + 1}` });
        if (nav.length) buttons.push(nav);
        buttons.push([{ text: "🔙 Kembali Menu", callback_data: "smm_menu_utama" }]);

        await bot.editMessageCaption(`📂 *KATEGORI LAYANAN*\nHalaman ${page + 1}/${totalPages}\n\nPilih kategori layanan:`, { 
            chat_id: chatId, 
            message_id: messageId, 
            parse_mode: 'Markdown', 
            reply_markup: { inline_keyboard: buttons } 
        }).catch(() => {});
    }

    if (data.startsWith('smm_select_cat:')) {
        const parts = data.split(':');
        const catIndex = parseInt(parts[1]);
        const srvPage = parseInt(parts[2]);

        if (!cachedServices) {
            const res = await callSmmApi('/services');
            if (res.status && res.services) cachedServices = res.services;
        }

        const categories = [...new Set(cachedServices.map(s => s.category))];
        const selectedCat = categories[catIndex];
        const services = cachedServices.filter(s => s.category === selectedCat);

        const perPage = 5;
        const totalPages = Math.ceil(services.length / perPage);
        const start = srvPage * perPage;
        const currentServices = services.slice(start, start + perPage);

        let caption = `📂 *Kategori:* ${selectedCat}\n\n`;
        const buttons = [];

        currentServices.forEach(s => {
            const price = parseInt(s.price) + (config.UNTUNG_SMM || 500);
            caption += `🆔 *ID:* ${s.id}\n✨ *Layanan:* ${s.name}\n💰 *Harga:* Rp${price.toLocaleString('id-ID')}/1000\n🔻 *Min:* ${s.min} | 🔺 *Max:* ${s.max}\n\n`;
            buttons.push([{ text: `Pilih ID ${s.id}`, callback_data: `smm_order_input:${s.id}` }]);
        });

        const nav = [];
        if (srvPage > 0) nav.push({ text: "⬅️ Prev", callback_data: `smm_select_cat:${catIndex}:${srvPage - 1}` });
        if (srvPage < totalPages - 1) nav.push({ text: "Next ➡️", callback_data: `smm_select_cat:${catIndex}:${srvPage + 1}` });
        if (nav.length) buttons.push(nav);
        buttons.push([{ text: "🔙 Kembali Kategori", callback_data: "smm_list_cat_0" }]);

        await bot.editMessageCaption(caption, { 
            chat_id: chatId, 
            message_id: messageId, 
            parse_mode: 'Markdown', 
            reply_markup: { inline_keyboard: buttons } 
        }).catch(() => {});
    }

    if (data.startsWith('smm_order_input:')) {
        const serviceId = data.split(':')[1];
        smmSession[userId] = { step: 'input_link', serviceId: serviceId, chatId: chatId };
        
        await bot.sendMessage(chatId, `🔗 *MASUKKAN LINK TARGET*\n\nSilakan kirim link atau username target.\n_Ketik 'batal' untuk membatalkan._`, { parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(query.id);
    }

    if (data === 'smm_confirm_buy') {
        const session = smmSession[userId];
        if (!session || !session.readyToBuy) return;
        
        const channellog = config.idchannel; 
        
        const saldoPath = path.join(__dirname, "./database/saldoOtp.json");
        let saldoData = {};
        try { saldoData = JSON.parse(fs.readFileSync(saldoPath)); } catch {}
        let userSaldo = saldoData[userId] || 0;

        if (userSaldo < session.totalPrice) {
            return bot.editMessageText(`❌ *Saldo Tidak Cukup!*\nButuh: Rp${session.totalPrice.toLocaleString('id-ID')}\nSaldo: Rp${userSaldo.toLocaleString('id-ID')}\n\nSilakan deposit terlebih dahulu.`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        }

        await bot.editMessageText("⏳ *Memproses order ke server pusat...*", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });

        const res = await callSmmApi('/order', { 
            service: session.serviceId, 
            target: session.link, 
            quantity: session.qty 
        });

        if (res.status === true || res.order) {
            saldoData[userId] -= session.totalPrice;
            fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));
            
            const orderId = res.order || res.data?.id || res.id || "-";

            const smmHistoryPath = path.join(__dirname, "./database/smmHistory.json");
            let historyDB = [];
            if (fs.existsSync(smmHistoryPath)) {
                try { historyDB = JSON.parse(fs.readFileSync(smmHistoryPath)); } catch {}
            }

            const newHistory = {
                orderId: orderId,
                userId: userId,
                serviceName: session.serviceName,
                target: session.link,
                qty: session.qty,
                price: session.totalPrice,
                date: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
                status: "Pending/Proses"
            };

            historyDB.push(newHistory);
            fs.writeFileSync(smmHistoryPath, JSON.stringify(historyDB, null, 2));

            if (channellog && channellog !== "0") {
                let targetMasked = session.link;
                if (targetMasked.length > 15) {
                    targetMasked = targetMasked.substring(0, 6) + "********" + targetMasked.substring(targetMasked.length - 4);
                } else {
                    targetMasked = targetMasked.substring(0, 3) + "****";
                }

                const notifSmm = `
📢 *TRANSAKSI SUNTIK SOSMED SUKSES*

📦 *Layanan:* ${session.serviceName}
🔗 *Target:* \`${targetMasked}\`
🔢 *Jumlah:* ${session.qty}

🆔 *Order ID:* \`${orderId}\`
💰 *Harga:* Rp${session.totalPrice.toLocaleString('id-ID')}

👤 *Pembeli:* ${query.from.first_name}
🆔 *ID Telegram:* \`${userId}\`
➕ *Point bonus ditambah:* 500
📆 *Tanggal:* ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}

✅ *Status:* Order berhasil dikirim ke server pusat & Terima kasih Atas pembelian Anda🙏.
🤖 *Terima kasih telah Menggunakan bot Auto Order ManzzyID Official*
`;
                bot.sendMessage(channellog, notifSmm, { parse_mode: 'Markdown' })
                   .catch(e => console.log("Gagal kirim notif SMM ke channel:", e.message));
            }

            delete smmSession[userId];

            await bot.editMessageText(
                `✅ *ORDER SUKSES!*\n\n` +
                `🆔 Order ID: \`${orderId}\`\n` +
                `📦 Layanan: ${session.serviceName}\n` +
                `🎯 Target: ${session.link}\n` +
                `💰 Biaya: Rp${session.totalPrice.toLocaleString('id-ID')}\n` +
                `📉 Sisa Saldo: Rp${saldoData[userId].toLocaleString('id-ID')}`, 
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
            );
        } else {
            const errorMsg = res.data || res.message || res.error || "Gagal memproses order.";
            await bot.editMessageText(`❌ *ORDER GAGAL!*\n${errorMsg}`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        }
    }

    if (data === 'smm_cancel_buy') {
        delete smmSession[userId];
        await bot.deleteMessage(chatId, messageId).catch(()=>{});
        await bot.sendMessage(chatId, "❌ Transaksi dibatalkan.");
    }
    
    if (data.startsWith('smm_history_page_')) {
        const page = parseInt(data.split('_')[3]);
        const smmHistoryPath = path.join(__dirname, "./database/smmHistory.json");
        
        let allHistory = [];
        if (fs.existsSync(smmHistoryPath)) {
            try { allHistory = JSON.parse(fs.readFileSync(smmHistoryPath)); } catch {}
        }

        const userHistory = allHistory.filter(h => String(h.userId) === String(userId)).reverse();

        if (userHistory.length === 0) {
            return bot.answerCallbackQuery(query.id, { text: "⚠️ Kamu belum memiliki riwayat order SMM.", show_alert: true });
        }

        const perPage = 5;
        const totalPages = Math.ceil(userHistory.length / perPage);
        
        const currentPage = page < 1 ? 1 : page > totalPages ? totalPages : page;
        const start = (currentPage - 1) * perPage;
        const end = start + perPage;
        const pageData = userHistory.slice(start, end);

        let caption = `📜 *RIWAYAT ORDER SUNTIK SOSMED*\n`;
        caption += `👤 User: ${query.from.first_name}\n`;
        caption += `📄 Halaman: *${currentPage}* dari *${totalPages}*\n`;
        caption += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        pageData.forEach((h, i) => {
            caption += `*${start + i + 1}. ${h.serviceName}*\n`;
            caption += `🆔 Order ID: \`${h.orderId}\`\n`;
            caption += `🔗 Target: ${h.target}\n`;
            caption += `🔢 Jumlah: ${h.qty}\n`;
            caption += `💰 Harga: Rp ${parseInt(h.price).toLocaleString('id-ID')}\n`;
            caption += `📅 Tanggal: ${h.date}\n\n`;
        });

        caption += `📌 *Total Order:* ${userHistory.length} Transaksi`;

        const navButtons = [];
        if (currentPage > 1) {
            navButtons.push({ text: "⬅️ Prev", callback_data: `smm_history_page_${currentPage - 1}` });
        }
        if (currentPage < totalPages) {
            navButtons.push({ text: "Next ➡️", callback_data: `smm_history_page_${currentPage + 1}` });
        }

        const keyboard = [];
        if (navButtons.length > 0) keyboard.push(navButtons);
        keyboard.push([{ text: "🔙 Kembali Menu SMM", callback_data: "smm_menu_utama" }]);

        await bot.editMessageMedia(
            { 
                type: 'photo', 
                media: config.ppthumb, 
                caption: caption, 
                parse_mode: 'Markdown' 
            }, 
            { 
                chat_id: chatId, 
                message_id: messageId, 
                reply_markup: { inline_keyboard: keyboard } 
            }
        ).catch(async () => {
             await bot.editMessageCaption(caption, {
                chat_id: chatId, 
                message_id: messageId, 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
             });
        });
    }
    
    if (data === 'smm_check_status') {
        smmSession[userId] = { step: 'input_status_id' };
        await bot.sendMessage(chatId, "🔍 *CEK STATUS PESANAN*\n\nSilakan masukkan **Order ID** yang ingin dicek.\nContoh: `12345`", { parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(query.id);
    }
  } catch (err) {
    console.error("Callback SMM Error:", err);
    bot.sendMessage(query.message.chat.id, "❌ Terjadi kesalahan pada sistem SMM.");
  }
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const smmSess = smmSession[userId];
    
    if (!smmSess) return;

    if (msg.text.toLowerCase() === 'batal') {
        delete smmSession[userId];
        return bot.sendMessage(chatId, "❌ Proses SMM dibatalkan.", { reply_markup: { remove_keyboard: true } });
    }

        if (smmSess.step === 'input_status_id') {
        const orderId = msg.text.trim();
        
        const loadingMsg = await bot.sendMessage(chatId, "⏳ _Sedang mengecek ke server..._", { parse_mode: 'Markdown' });

        const res = await callSmmApi('/status', { id: orderId });
        
        delete smmSession[userId];
        await bot.deleteMessage(chatId, loadingMsg.message_id).catch(()=>{});

        console.log("Respon API SMM:", res);

        if (res.status === true) {
            const statusText = (res.order_status || "Pending").toUpperCase(); 
            const startCount = res.start_count || "0";
            const remains = res.remains || "0";
            const charge = parseInt(res.charge || 0).toLocaleString('id-ID');
            
            return bot.sendMessage(chatId, 
                `📊 *STATUS ORDER #${orderId}*\n\n` +
                `🛡️ Status: *${statusText}*\n` +
                `🔢 Start Count: ${startCount}\n` +
                `📉 Sisa (Remains): ${remains}\n` +
                `💸 Biaya Terpakai: Rp ${charge}`, 
                { parse_mode: 'Markdown' }
            );
        } else {
            const errorMsg = res.msg || "ID Pesanan tidak ditemukan.";
            return bot.sendMessage(chatId, `❌ *Gagal Cek Status*\n\n${errorMsg}`, { parse_mode: 'Markdown' });
        }
    }

    if (smmSess.step === 'input_link') {
        smmSess.link = msg.text.trim();
        
        if (!cachedServices) {
             const res = await callSmmApi('/services');
             if(res.status && res.services) cachedServices = res.services;
        }
        
        const service = cachedServices ? cachedServices.find(s => s.id == smmSess.serviceId) : null;
        
        if (!service) {
            delete smmSession[userId];
            return bot.sendMessage(chatId, "❌ Gagal memuat data layanan. Silakan coba ulangi dari menu awal.");
        }
        
        smmSess.min = service.min;
        smmSess.max = service.max;
        smmSess.serviceName = service.name;
        smmSess.basePrice = service.price;
        smmSess.step = 'input_qty';
        
        return bot.sendMessage(chatId, 
            `🔢 *MASUKKAN JUMLAH*\n\n📦 Layanan: ${service.name}\n\n🔻 Min: ${service.min}\n🔺 Max: ${service.max}\n\nSilakan masukkan jumlah pesanan (angka saja):`, 
            { parse_mode: 'Markdown' }
        );
    }

    if (smmSess.step === 'input_qty') {
        const qty = parseInt(msg.text);
        
        if (isNaN(qty) || qty < smmSess.min || qty > smmSess.max) {
            return bot.sendMessage(chatId, `❌ Jumlah tidak valid!\nHarus antara ${smmSess.min} sampai ${smmSess.max}. Silakan input lagi.`);
        }
        
        smmSess.qty = qty;
        const untung = config.UNTUNG_SMM || 500;
        const pricePerK = parseInt(smmSess.basePrice) + untung;
        const total = Math.ceil((pricePerK / 1000) * qty);
        smmSess.totalPrice = total;
        smmSess.readyToBuy = true;
        smmSess.step = 'confirm';

        const confirmTxt = `📝 *KONFIRMASI PESANAN*\n\n📦 Layanan: ${smmSess.serviceName}\n🔗 Target: ${smmSess.link}\n🔢 Jumlah: ${qty}\n\n💰 *Total Bayar: Rp ${total.toLocaleString('id-ID')}*\n\nApakah sudah benar?`;
        
        const keyboard = [
            [{ text: "✅ Proses Order", callback_data: "smm_confirm_buy" }], 
            [{ text: "❌ Batal", callback_data: "smm_cancel_buy" }]
        ];
        
        return bot.sendMessage(chatId, confirmTxt, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    }
});

let resellerState = {};

bot.on('callback_query', async (cb) => {
    const data = cb.data;
    const message = cb.message;
    const chatId = message.chat.id;
    const messageId = message.message_id;
    const userId = cb.from.id.toString();
    
    const config = require("./config.js");
    const fs = require("fs");
    const path = require("path");

    if (typeof guardAll === "function") {
        if (await guardAll(message)) return;
    }

    if (data === "upgrade_reseller_menu") {
        const resellerPath = path.join(__dirname, "./database/reseller.json");
        
        let isReseller = false;
        try {
            if (fs.existsSync(resellerPath)) {
                const dbRes = JSON.parse(fs.readFileSync(resellerPath));
                isReseller = dbRes.some(u => u.id === userId);
            }
        } catch {}

        if (isReseller) {
            const produkPath = path.join(__dirname, "./database/produk.json");
            let allProduk = [];
            try { if (fs.existsSync(produkPath)) allProduk = JSON.parse(fs.readFileSync(produkPath)); } catch {}

            const myProduk = allProduk.filter(p => p.ownerId === userId);
            
            const balanceDB = loadResBalance();
            const myIncome = balanceDB[userId] || 0;

            const caption = `
🎛 <b>DASHBOARD RESELLER</b>

Halo <b>${cb.from.first_name}</b>
Status: 👑 <b>Premium Reseller</b>

💰 <b>Pendapatan:</b> Rp ${myIncome.toLocaleString("id-ID")}
📦 <b>Produk Aktif:</b> ${myProduk.length} Item

Silakan kelola toko Anda melalui menu di bawah ini:
`;
            const keyboard = [
                [
                    { text: "➕ Tambah Produk", callback_data: "rs_add_produk" },
                    { text: "📦 List Produk Saya", callback_data: "rs_my_list" }
                ],
                [
                    { text: "📥 Isi Stok", callback_data: "rs_add_stok_menu" },
                    { text: "🗑 Hapus Stok", callback_data: "rs_del_stok_menu" }
                ],
                [
                    { text: "💸 Tarik Saldo (WD)", callback_data: "rs_withdraw_menu" }
                ],
                [
                    { text: "❌ Hapus Produk", callback_data: "rs_del_produk_menu" }
                ],
                [{ text: "🔙 Kembali Menu Utama", callback_data: "back_home" }]
            ];

            return bot.editMessageMedia({
                type: "photo",
                media: config.ppthumb,
                caption: caption,
                parse_mode: "HTML"
            }, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: keyboard }
            }).catch(() => {
                bot.editMessageCaption(caption, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: keyboard }
                });
            });
        }

        const hargaReseller = config.HARGA_RESELLER || 50000;
        const captionJualan = `
👑 <b>UPGRADE PREMIUM RESELLER</b>

Dapatkan akses eksklusif untuk menjual produk digital Anda sendiri di dalam bot ini!

<b>🔥 Keuntungan Reseller:</b>
✅ Bisa <b>Upload Produk Sendiri</b>
✅ Atur Harga & Stok Sendiri
✅ Produk Anda dilihat oleh seluruh user bot
✅ Mendapatkan harga spesial (jika diatur admin)
💰 <b>Bonus Point:</b> 10,000 setelah upgrade

💸 <b>Biaya Pendaftaran:</b>
Rp ${hargaReseller.toLocaleString("id-ID")} (Lifetime/Seumur Hidup)

<i>Klik tombol di bawah untuk membeli akses Reseller.</i>
`;
        const keyboardJualan = [
            [{ text: "✅ Beli Akses Reseller", callback_data: "buy_reseller_confirm" }],
            [{ text: "⬅️ Kembali", callback_data: "back_home" }]
        ];

        return bot.editMessageMedia({
            type: "photo",
            media: config.ppthumb,
            caption: captionJualan,
            parse_mode: "HTML"
        }, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: keyboardJualan }
        }).catch(() => {
            bot.editMessageCaption(captionJualan, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: keyboardJualan }
            });
        });
    }

    if (data === "buy_reseller_confirm") {
        const resellerPath = path.join(__dirname, "./database/reseller.json");
        const saldoPath = path.join(__dirname, "./database/saldoOtp.json");
        const hargaReseller = config.HARGA_RESELLER || 50000;
        
        if (!fs.existsSync(resellerPath)) fs.writeFileSync(resellerPath, JSON.stringify([], null, 2));
        if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}, null, 2));
        
        let saldoData = JSON.parse(fs.readFileSync(saldoPath));
        const userSaldo = saldoData[userId] || 0;

        let finalPrice = hargaReseller;
        let discountInfo = "";
        if (typeof applyDiscount === "function") {
             const disc = applyDiscount(userId, hargaReseller);
             finalPrice = disc.finalPrice;
             if (disc.code) {
                 useDiscount(userId);
                 discountInfo = `\n📉 Diskon ${disc.percent}%: -Rp${disc.discountAmount.toLocaleString("id-ID")}`;
             }
        }

        if (userSaldo < finalPrice) {
            return bot.answerCallbackQuery(cb.id, {
                text: `❌ Saldo kurang! Butuh Rp${finalPrice.toLocaleString("id-ID")}`,
                show_alert: true
            });
        }

        saldoData[userId] = userSaldo - finalPrice;
        fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

        const resellerDB = JSON.parse(fs.readFileSync(resellerPath));
        resellerDB.push({
            id: userId,
            date: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        });
        fs.writeFileSync(resellerPath, JSON.stringify(resellerDB, null, 2));

        try {
            const pointPath = path.join(__dirname, "./database/pointSaldo.json");
            if (fs.existsSync(pointPath)) {
                let pointDb = JSON.parse(fs.readFileSync(pointPath));
                if (!pointDb[userId]) pointDb[userId] = { point_total: 0, history: [] };
                pointDb[userId].point_total += 10000;
                fs.writeFileSync(pointPath, JSON.stringify(pointDb, null, 2));
            }
        } catch {}

        await bot.editMessageCaption(`
🎉 <b>UPGRADE RESELLER BERHASIL!</b>

💰 Harga Awal: Rp${hargaReseller.toLocaleString("id-ID")}${discountInfo}
💵 Total Bayar: Rp${finalPrice.toLocaleString("id-ID")}
💳 Sisa Saldo: Rp${saldoData[userId].toLocaleString("id-ID")}

Selamat! Menu dashboard reseller kini terbuka untuk Anda.
`, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [[{ text: "🚀 Buka Dashboard", callback_data: "upgrade_reseller_menu" }]]
            }
        });
    }

    if (data === "rs_add_produk") {
        resellerState[userId] = { step: "RS_INPUT_NAME" };
        await bot.sendMessage(chatId, "🔤 <b>Masukkan Nama Produk:</b>\n\nContoh: <i>Netflix Premium 1 Bulan</i>", { parse_mode: "HTML" });
        await bot.answerCallbackQuery(cb.id);
    }

    if (data === "rs_my_list") {
        const produkPath = path.join(__dirname, "./database/produk.json");
        let allProduk = [];
        try { allProduk = JSON.parse(fs.readFileSync(produkPath)); } catch {}
        
        const myProduk = allProduk.filter(p => p.ownerId === userId);

        if (myProduk.length === 0) {
            return bot.answerCallbackQuery(cb.id, { text: "⚠️ Anda belum memiliki produk.", show_alert: true });
        }

        let text = `📦 <b>DAFTAR PRODUK ANDA</b>\n\n`;
        myProduk.forEach((p, i) => {
            text += `<b>${i + 1}. ${p.nama}</b>\n`;
            text += `   💰 Rp${p.harga.toLocaleString("id-ID")}\n`;
            text += `   📦 Stok: ${p.stok.length}\n`;
            text += `   🆔 ID: <code>${p.id}</code>\n\n`;
        });

        const keyboard = [[{ text: "🔙 Kembali Dashboard", callback_data: "upgrade_reseller_menu" }]];

        await bot.editMessageCaption(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    if (data === "rs_del_produk_menu") {
        const produkPath = path.join(__dirname, "./database/produk.json");
        let allProduk = [];
        try { allProduk = JSON.parse(fs.readFileSync(produkPath)); } catch {}

        const myProduk = allProduk.filter(p => p.ownerId === userId);

        if (myProduk.length === 0) return bot.answerCallbackQuery(cb.id, { text: "⚠️ Tidak ada produk untuk dihapus.", show_alert: true });

        const buttons = myProduk.map((item) => ([{
            text: `🗑 Hapus: ${item.nama}`,
            callback_data: `rs_act_del_${item.id}`
        }]));
        
        buttons.push([{ text: "🔙 Kembali", callback_data: "upgrade_reseller_menu" }]);

        await bot.editMessageCaption("🗑 <b>Pilih Produk Yang Ingin Dihapus:</b>", {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: buttons }
        });
    }

    if (data === "rs_add_stok_menu") {
        const produkPath = path.join(__dirname, "./database/produk.json");
        let allProduk = [];
        try { allProduk = JSON.parse(fs.readFileSync(produkPath)); } catch {}

        const myProduk = allProduk.filter(p => p.ownerId === userId);

        if (myProduk.length === 0) return bot.answerCallbackQuery(cb.id, { text: "⚠️ Buat produk dulu.", show_alert: true });

        const buttons = myProduk.map((item) => ([{
            text: `➕ Stok: ${item.nama}`,
            callback_data: `rs_act_add_${item.id}`
        }]));

        buttons.push([{ text: "🔙 Kembali", callback_data: "upgrade_reseller_menu" }]);

        await bot.editMessageCaption("📥 <b>Pilih Produk Untuk Isi Stok:</b>", {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: buttons }
        });
    }

    if (data === "rs_del_stok_menu") {
        const produkPath = path.join(__dirname, "./database/produk.json");
        let allProduk = [];
        try { allProduk = JSON.parse(fs.readFileSync(produkPath)); } catch {}

        const myProduk = allProduk.filter(p => p.ownerId === userId);

        if (myProduk.length === 0) return bot.answerCallbackQuery(cb.id, { text: "⚠️ Produk tidak ditemukan.", show_alert: true });

        const buttons = myProduk.map((item) => ([{
            text: `❌ Clear Stok: ${item.nama}`,
            callback_data: `rs_act_clear_${item.id}`
        }]));

        buttons.push([{ text: "🔙 Kembali", callback_data: "upgrade_reseller_menu" }]);

        await bot.editMessageCaption("🗑 <b>Pilih Produk Untuk Kosongkan Stok:</b>", {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: buttons }
        });
    }

    if (data.startsWith("rs_act_del_")) {
        const targetId = data.replace("rs_act_del_", "");
        const produkPath = path.join(__dirname, "./database/produk.json");
        let db = [];
        try { db = JSON.parse(fs.readFileSync(produkPath)); } catch {}

        const produk = db.find(p => p.id === targetId);
        
        if (!produk) return bot.answerCallbackQuery(cb.id, {text: "❌ Produk tidak ditemukan."});
        if (produk.ownerId !== userId) return bot.answerCallbackQuery(cb.id, {text: "❌ Bukan produk Anda!", show_alert: true});

        db = db.filter(p => p.id !== targetId);
        fs.writeFileSync(produkPath, JSON.stringify(db, null, 2));

        await bot.answerCallbackQuery(cb.id, { text: "✅ Produk berhasil dihapus!" });
        
        return bot.editMessageCaption("✅ <b>Produk Telah Dihapus.</b>", {
             chat_id: chatId, 
             message_id: messageId, 
             parse_mode: "HTML",
             reply_markup: { inline_keyboard: [[{ text: "🔙 Dashboard", callback_data: "upgrade_reseller_menu" }]] }
        });
    }

    if (data.startsWith("rs_act_clear_")) {
        const targetId = data.replace("rs_act_clear_", "");
        const produkPath = path.join(__dirname, "./database/produk.json");
        let db = [];
        try { db = JSON.parse(fs.readFileSync(produkPath)); } catch {}
        
        const idx = db.findIndex(p => p.id === targetId);
        if (idx === -1) return bot.answerCallbackQuery(cb.id, {text: "❌ Error."});
        
        if (db[idx].ownerId !== userId) return bot.answerCallbackQuery(cb.id, {text: "❌ Akses Ditolak!", show_alert:true});

        db[idx].stok = []; 
        fs.writeFileSync(produkPath, JSON.stringify(db, null, 2));

        await bot.answerCallbackQuery(cb.id, { text: "✅ Stok dikosongkan!" });
        return bot.editMessageCaption(`✅ <b>Stok ${db[idx].nama} Berhasil Dikosongkan!</b>`, {
             chat_id: chatId, 
             message_id: messageId, 
             parse_mode: "HTML",
             reply_markup: { inline_keyboard: [[{ text: "🔙 Dashboard", callback_data: "upgrade_reseller_menu" }]] }
        });
    }

    if (data.startsWith("rs_act_add_")) {
        const targetId = data.replace("rs_act_add_", "");
        const produkPath = path.join(__dirname, "./database/produk.json");
        let db = [];
        try { db = JSON.parse(fs.readFileSync(produkPath)); } catch {}

        const item = db.find(p => p.id === targetId);
        if (!item || item.ownerId !== userId) return bot.answerCallbackQuery(cb.id, {text: "❌ Error Validasi."});

        resellerState[userId] = { step: "RS_INPUT_STOK", prodId: targetId };
        
        const msgContoh = `
📥 <b>ISI STOK PRODUK: ${item.nama}</b>

Silakan kirim data stok yang ingin dimasukkan.
Bot mendukung input banyak baris.

<b>Contoh Format Akun:</b>
<code>email1@gmail.com|pass123
email2@gmail.com|pass321</code>

<i>Kirim data stok Anda sekarang...</i>
`;
        await bot.sendMessage(chatId, msgContoh, { parse_mode: "HTML" });
        await bot.answerCallbackQuery(cb.id);
    }
    
    if (data === "rs_withdraw_menu") {
        const balanceDB = loadResBalance();
        const currentBalance = balanceDB[userId] || 0;

        if (currentBalance < 5000) { 
            return bot.answerCallbackQuery(cb.id, { text: `❌ Minimal WD Rp 10.000\nSaldo Anda: Rp ${currentBalance.toLocaleString("id-ID")}`, show_alert: true });
        }

        resellerState[userId] = { step: "RS_WD_REQ_NUM" };
        await bot.sendMessage(chatId, 
            `💸 <b>FORMULIR WITHDRAW</b>\n\n💰 Saldo Tersedia: <b>Rp ${currentBalance.toLocaleString("id-ID")}</b>\n\nSilakan kirim <b>Nomor E-Wallet / Rekening</b> tujuan pencairan.\n\nContoh:\n<i>DANA 0812xxxx</i>`, 
            { parse_mode: "HTML" }
        );
        await bot.answerCallbackQuery(cb.id);
    }
    
    if (data.startsWith("wd_approve_")) {
        const parts = data.split("_");
        const targetUserId = parts[2];
        const nominal = parseInt(parts[3]);

        if (userId !== config.OWNER_ID.toString()) return bot.answerCallbackQuery(cb.id, { text: "❌ Akses Ditolak", show_alert: true });

        bot.sendMessage(targetUserId, 
            `✅ <b>WITHDRAW BERHASIL!</b>\n\nPermintaan penarikan saldo sebesar <b>Rp ${nominal.toLocaleString("id-ID")}</b> telah disetujui dan dikirim oleh Owner.\n\nSilakan tunggu beberapa menit Owner akan memproses wd anda.`, 
            { parse_mode: "HTML" }
        ).catch(()=>{});

        bot.editMessageCaption(
            `✅ <b>REQUEST WD DISETUJUI</b>\n\nKepada: <code>${targetUserId}</code>\nNominal: Rp ${nominal.toLocaleString("id-ID")}\n\n<i>Status: Selesai ditransfer.</i>`, 
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "HTML"
            }
        );
        return bot.answerCallbackQuery(cb.id, { text: "✅ Berhasil disetujui" });
    }

    if (data.startsWith("wd_reject_")) {
        const parts = data.split("_");
        const targetUserId = parts[2];
        const nominal = parseInt(parts[3]);

        if (userId !== config.OWNER_ID.toString()) return bot.answerCallbackQuery(cb.id, { text: "❌ Akses Ditolak", show_alert: true });

        const balanceDB = loadResBalance();
        balanceDB[targetUserId] = (balanceDB[targetUserId] || 0) + nominal;
        saveResBalance(balanceDB);

        bot.sendMessage(targetUserId, 
            `❌ <b>WITHDRAW DITOLAK</b>\n\nPermintaan penarikan <b>Rp ${nominal.toLocaleString("id-ID")}</b> ditolak oleh Owner.\nSaldo telah dikembalikan ke akun Anda.`, 
            { parse_mode: "HTML" }
        ).catch(()=>{});

        bot.editMessageCaption(
            `❌ <b>REQUEST WD DITOLAK</b>\n\nKepada: <code>${targetUserId}</code>\nNominal: Rp ${nominal.toLocaleString("id-ID")}\n\n<i>Saldo user telah dikembalikan.</i>`, 
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "HTML"
            }
        );
        return bot.answerCallbackQuery(cb.id, { text: "❌ Berhasil ditolak & direfund" });
    }
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    
    const userId = msg.from.id.toString();
    const chatId = msg.chat.id;
    const fs = require("fs");
    const path = require("path");

    if (resellerState[userId]) {
        const step = resellerState[userId].step;
        const produkPath = path.join(__dirname, "./database/produk.json");

        if (step === "RS_INPUT_NAME") {
            resellerState[userId].nama = msg.text;
            resellerState[userId].step = "RS_INPUT_PRICE";
            return bot.sendMessage(chatId, "💰 <b>Masukkan Harga Produk (Angka):</b>\nContoh: 15000", { parse_mode: "HTML" });
        }

        else if (step === "RS_INPUT_PRICE") {
            const price = parseInt(msg.text.replace(/[^0-9]/g, ""));
            if (isNaN(price)) return bot.sendMessage(chatId, "❌ Harap masukkan angka valid.");
            
            resellerState[userId].harga = price;
            resellerState[userId].step = "RS_INPUT_DESC";
            return bot.sendMessage(chatId, "📝 <b>Masukkan Deskripsi Produk:</b>", { parse_mode: "HTML" });
        }

        else if (step === "RS_INPUT_DESC") {
            const newProduk = {
                id: "prod_" + Date.now(),
                nama: resellerState[userId].nama,
                harga: resellerState[userId].harga,
                deskripsi: msg.text,
                stok: [],
                ownerId: userId
            };

            let db = [];
            try {
                if (fs.existsSync(produkPath)) {
                    db = JSON.parse(fs.readFileSync(produkPath));
                }
            } catch {}

            db.push(newProduk);
            fs.writeFileSync(produkPath, JSON.stringify(db, null, 2));
            
            delete resellerState[userId];
            
            return bot.sendMessage(chatId, 
                `✅ <b>Produk Berhasil Ditambahkan!</b>\n\n📦 Nama: ${newProduk.nama}\n💰 Harga: Rp${newProduk.harga.toLocaleString("id-ID")}\n\nProduk kini muncul di Menu Produk.`, 
                { parse_mode: "HTML" }
            );
        }

        else if (step === "RS_INPUT_STOK") {
            const prodId = resellerState[userId].prodId;
            let db = [];
            try { db = JSON.parse(fs.readFileSync(produkPath)); } catch {}

            const idx = db.findIndex(p => p.id === prodId);

            if (idx === -1 || db[idx].ownerId !== userId) {
                 delete resellerState[userId];
                 return bot.sendMessage(chatId, "❌ Produk tidak valid atau bukan milik Anda.");
            }

            const newStock = msg.text.split("\n").filter(s => s.trim() !== "");
            db[idx].stok = db[idx].stok.concat(newStock);
            fs.writeFileSync(produkPath, JSON.stringify(db, null, 2));
            
            delete resellerState[userId];
            return bot.sendMessage(chatId, `✅ <b>Berhasil Menambahkan ${newStock.length} Stok!</b>\nTotal Stok: ${db[idx].stok.length}`, { parse_mode: "HTML" });
        }
        
        else if (step === "RS_WD_REQ_NUM") {
            resellerState[userId].wd_number = msg.text;
            resellerState[userId].step = "RS_WD_REQ_NOMINAL";
            
            const balanceDB = loadResBalance();
            const saldo = balanceDB[userId] || 0;

            return bot.sendMessage(chatId, `💰 <b>Saldo: Rp ${saldo.toLocaleString("id-ID")}</b>\n\nMasukkan nominal yang ingin ditarik (Angka saja):\nContoh: 50000`, { parse_mode: "HTML" });
        }

        else if (step === "RS_WD_REQ_NOMINAL") {
            const nominal = parseInt(msg.text.replace(/[^0-9]/g, ""));
            const balanceDB = loadResBalance();
            const currentBalance = balanceDB[userId] || 0;
            const config = require("./config.js");

            if (isNaN(nominal) || nominal <= 0) return bot.sendMessage(chatId, "❌ Nominal tidak valid.");
            if (nominal > currentBalance) return bot.sendMessage(chatId, `❌ Saldo tidak cukup. Sisa: Rp ${currentBalance.toLocaleString("id-ID")}`);

            balanceDB[userId] = currentBalance - nominal;
            saveResBalance(balanceDB);

            await bot.sendMessage(chatId, 
                `⏳ <b>Permintaan WD Diterima</b>\n\nPermintaan sebesar <b>Rp ${nominal.toLocaleString("id-ID")}</b> sedang diproses.\nSilakan tunggu beberapa menit hingga Owner menyetujui.`, 
                { parse_mode: "HTML" }
            );

            const ownerMsg = `
🔔 <b>REQUEST WITHDRAW BARU</b>

👤 <b>Reseller:</b> ${msg.from.first_name} (ID: <code>${userId}</code>)
💰 <b>Nominal:</b> Rp ${nominal.toLocaleString("id-ID")}
💳 <b>Tujuan:</b>
<code>${resellerState[userId].wd_number}</code>

<i>Saldo reseller sudah dipotong oleh bot.
Klik <b>Setuju</b> jika sudah transfer, atau <b>Tolak</b> untuk refund.</i>
`;
            const ownerKeyboard = [
                [
                    { text: "✅ Setuju (Sudah Transfer)", callback_data: `wd_approve_${userId}_${nominal}` },
                    { text: "❌ Tolak (Refund)", callback_data: `wd_reject_${userId}_${nominal}` }
                ]
            ];

            await bot.sendMessage(config.OWNER_ID, ownerMsg, { 
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: ownerKeyboard }
            });

            delete resellerState[userId];
        }
    }
});

const produkPath = path.join(__dirname, "./database/produk.json");
if (!fs.existsSync(produkPath)) fs.writeFileSync(produkPath, JSON.stringify([], null, 2));

let produkState = {};

function saveProduk(data) {
  fs.writeFileSync(produkPath, JSON.stringify(data, null, 2));
}

function loadProduk() {
  if (!fs.existsSync(produkPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(produkPath));
  } catch {
    return [];
  }
}

bot.onText(/^\/addproduk$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  if (userId !== owner) return;
  produkState[userId] = { step: "ADD_PRODUK_NAME" };
  await bot.sendMessage(chatId, "🔤 <b>Silakan Masukkan Nama Produk:</b>", { parse_mode: "HTML" });
});

bot.onText(/^\/delproduk$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  if (userId !== owner) return;
  const data = loadProduk();
  if (data.length === 0) return bot.sendMessage(chatId, "❌ Belum ada produk tersimpan.");
  
  const buttons = data.map((item) => ([{
    text: `🗑 Hapus ${item.nama}`,
    callback_data: `admin_del_produk_${item.id}`
  }]));
  
  await bot.sendMessage(chatId, "🗑 <b>Pilih Produk Yang Akan Dihapus:</b>", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.onText(/^\/addstok$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  if (userId !== owner) return;
  const data = loadProduk();
  if (data.length === 0) return bot.sendMessage(chatId, "❌ Belum ada produk.");
  
  const buttons = data.map((item) => ([{
    text: `➕ Stok ${item.nama}`,
    callback_data: `admin_add_stok_${item.id}`
  }]));
  
  await bot.sendMessage(chatId, "📦 <b>Pilih Produk Untuk Tambah Stok:</b>", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.onText(/^\/delstok$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  if (userId !== owner) return;
  const data = loadProduk();
  if (data.length === 0) return bot.sendMessage(chatId, "❌ Belum ada produk.");
  
  const buttons = data.map((item) => ([{
    text: `❌ Hapus Stok ${item.nama}`,
    callback_data: `admin_clear_stok_${item.id}`
  }]));
  
  await bot.sendMessage(chatId, "🗑 <b>Pilih Produk Untuk Hapus Semua Stok:</b>", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.onText(/^\/editstok$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  if (userId !== owner) return;
  const data = loadProduk();
  if (data.length === 0) return bot.sendMessage(chatId, "❌ Belum ada produk.");
  
  const buttons = data.map((item) => ([{
    text: `✏️ Edit ${item.nama}`,
    callback_data: `admin_edit_produk_${item.id}`
  }]));
  
  await bot.sendMessage(chatId, "✏️ <b>Pilih Produk Untuk Diedit (Harga/Deskripsi):</b>", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (produkState[userId]) {
    const step = produkState[userId].step;
    
    if (step === "ADD_PRODUK_NAME") {
      produkState[userId].nama = msg.text;
      produkState[userId].step = "ADD_PRODUK_PRICE";
      await bot.sendMessage(chatId, "💰 <b>Masukkan Harga Produk (Angka):</b>", { parse_mode: "HTML" });
    } else if (step === "ADD_PRODUK_PRICE") {
      const price = parseInt(msg.text.replace(/[^0-9]/g, ""));
      if (isNaN(price)) return bot.sendMessage(chatId, "❌ Harap masukkan angka valid.");
      produkState[userId].harga = price;
      produkState[userId].step = "ADD_PRODUK_DESC";
      await bot.sendMessage(chatId, "📝 <b>Masukkan Deskripsi Produk:</b>", { parse_mode: "HTML" });
    } else if (step === "ADD_PRODUK_DESC") {
      const newProduk = {
        id: "prod_" + Date.now(),
        nama: produkState[userId].nama,
        harga: produkState[userId].harga,
        deskripsi: msg.text,
        stok: []
      };
      const db = loadProduk();
      db.push(newProduk);
      saveProduk(db);
      delete produkState[userId];
      await bot.sendMessage(chatId, `✅ <b>Produk Berhasil Ditambahkan!</b>\n\n📦 Nama: ${newProduk.nama}\n💰 Harga: Rp${newProduk.harga.toLocaleString("id-ID")}`, { parse_mode: "HTML" });
    } else if (step === "ADD_STOK_CONTENT") {
      const prodId = produkState[userId].prodId;
      const db = loadProduk();
      const idx = db.findIndex(p => p.id === prodId);
      if (idx === -1) {
        delete produkState[userId];
        return bot.sendMessage(chatId, "❌ Produk tidak ditemukan.");
      }
      
      const newStock = msg.text.split("\n").filter(s => s.trim() !== "");
      db[idx].stok = db[idx].stok.concat(newStock);
      saveProduk(db);
      delete produkState[userId];
      await bot.sendMessage(chatId, `✅ <b>Berhasil Menambahkan ${newStock.length} Stok!</b>\nTotal Stok: ${db[idx].stok.length}`, { parse_mode: "HTML" });
    } else if (step === "EDIT_PRODUK_PRICE") {
      const prodId = produkState[userId].prodId;
      const price = parseInt(msg.text.replace(/[^0-9]/g, ""));
      if (isNaN(price)) return bot.sendMessage(chatId, "❌ Harap masukkan angka valid.");
      const db = loadProduk();
      const idx = db.findIndex(p => p.id === prodId);
      if (idx !== -1) {
        db[idx].harga = price;
        saveProduk(db);
        await bot.sendMessage(chatId, "✅ <b>Harga Berhasil Diubah!</b>", { parse_mode: "HTML" });
      }
      delete produkState[userId];
    } else if (step === "BUY_QTY") {
      const prodId = produkState[userId].prodId;
      const qty = parseInt(msg.text);
      
      if (isNaN(qty) || qty < 1) return bot.sendMessage(chatId, "❌ Jumlah tidak valid.");
      
      const db = loadProduk();
      const produk = db.find(p => p.id === prodId);
      
      if (!produk) {
        delete produkState[userId];
        return bot.sendMessage(chatId, "❌ Produk tidak ditemukan/dihapus.");
      }
      
      if (produk.stok.length < qty) {
        delete produkState[userId];
        return bot.sendMessage(chatId, `❌ <b>Stok Tidak Cukup!</b>\nSisa stok: ${produk.stok.length}`, { parse_mode: "HTML" });
      }
      
      const baseTotal = produk.harga * qty;
      const { finalPrice, discountAmount, code: diskonCode, percent: diskonPercent } = applyDiscount(userId, baseTotal);

      const saldoFile = JSON.parse(fs.readFileSync(saldoPath));
      const userSaldo = saldoFile[userId] || 0;
      
      if (userSaldo < finalPrice) {
        delete produkState[userId];
        return bot.sendMessage(chatId, `❌ <b>Saldo Tidak Cukup!</b>\nTotal: Rp${finalPrice.toLocaleString("id-ID")}\nSaldo: Rp${userSaldo.toLocaleString("id-ID")}`, { parse_mode: "HTML" });
      }
      
      saldoFile[userId] -= finalPrice;
      fs.writeFileSync(saldoPath, JSON.stringify(saldoFile, null, 2));

      if (diskonCode) useDiscount(userId);

      if (produk.ownerId) {
          const resBalancePath = path.join(__dirname, "./database/resellerBalance.json");
          
          if (!fs.existsSync(resBalancePath)) fs.writeFileSync(resBalancePath, JSON.stringify({}, null, 2));

          let resBalDB = {};
          try { resBalDB = JSON.parse(fs.readFileSync(resBalancePath)); } catch {}

          const income = produk.harga * qty;
          
          resBalDB[produk.ownerId] = (resBalDB[produk.ownerId] || 0) + income;
          fs.writeFileSync(resBalancePath, JSON.stringify(resBalDB, null, 2));

          bot.sendMessage(produk.ownerId, 
              `🔔 <b>PRODUK TERJUAL!</b>\n\n📦 <b>${produk.nama}</b>\n🔢 Jumlah: ${qty} pcs\n💰 Pendapatan: <b>+Rp ${income.toLocaleString("id-ID")}</b>\n\nSaldo dashboard Anda telah bertambah.`, 
              { parse_mode: "HTML" }
          ).catch(()=>{});
      }
      
      const items = produk.stok.splice(0, qty);
      saveProduk(db);
      delete produkState[userId];
      
      let discountText = "";
      if (diskonCode) {
        discountText = `\n├ 📉 <b>Diskon (${diskonPercent}%):</b> -Rp${discountAmount.toLocaleString("id-ID")}`;
      }

      const dataAkun = items.join("\n");
      const strukUser = `
✅ <b>PEMBELIAN TELAH BERHASIL</b>
📜 <b>STRUK PEMBELIAN PRODUK</b>
━━━━━━━━━━━━━━━━━━━━━
🪪 <b>IDENTITAS PEMBELI</b>
├ 👤 <b>Nama :</b> ${msg.from.first_name}
╰ 🆔 <b>ID :</b> ${userId}

🎀 <b>DATA PRODUK</b>
├ 🛒 <b>Produk :</b> ${produk.nama}
├ 📝 <b>Deskripsi :</b> ${produk.deskripsi}
├ 📦 <b>Jumlah :</b> ${qty} pcs
├ 💰 <b>Harga Satuan :</b> Rp${produk.harga.toLocaleString("id-ID")}
├ 💵 <b>Harga Awal :</b> Rp${baseTotal.toLocaleString("id-ID")}${discountText}
╰ 💸 <b>Total Bayar :</b> Rp${finalPrice.toLocaleString("id-ID")}

🔐 <b>DATA AKUN:</b>
<code>${dataAkun}</code>

📨 <b>Terimakasih Sudah Belanja Di Bot Kami</b>
📅 <i>${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</i>
`;

      await bot.sendMessage(chatId, strukUser, { parse_mode: "HTML" });
      
      if (config.idchannel) {
        const strukChannel = `
✅ <b>PEMBELIAN TELAH BERHASIL</b>
📜 <b>STRUK PEMBELIAN PRODUK</b>
━━━━━━━━━━━━━━━━━━━━━
🪪 <b>IDENTITAS PEMBELI</b>
├ 👤 <b>Nama :</b> ${msg.from.first_name}
╰ 🆔 <b>ID :</b> ${userId}

🎀 <b>DATA PRODUK</b>
├ 🛒 <b>Produk :</b> ${produk.nama}
├ 📦 <b>Jumlah :</b> ${qty} pcs
├ 💵 <b>Total Bayar :</b> Rp${finalPrice.toLocaleString("id-ID")}

📨 <b>Terimakasih Sudah Belanja Di Bot Kami</b>
📅 <i>${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</i>
`;
        await bot.sendMessage(config.idchannel, strukChannel, { parse_mode: "HTML" }).catch(() => {});
      }
      
      if (owner) {
        const strukOwner = `
🔔 <b>NOTIFIKASI PEMBELIAN BARU</b>

👤 <b>Buyer:</b> ${msg.from.first_name} (@${msg.from.username || "-"})
🆔 <b>ID:</b> ${userId}

📦 <b>Produk:</b> ${produk.nama}
🔢 <b>Qty:</b> ${qty}
💰 <b>Total Masuk:</b> Rp${finalPrice.toLocaleString("id-ID")}
📉 <b>Diskon:</b> ${diskonCode ? "Ya" : "Tidak"}
📉 <b>Sisa Stok:</b> ${produk.stok.length}

📅 <i>${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</i>
`;
        await bot.sendMessage(owner, strukOwner, { parse_mode: "HTML" }).catch(() => {});
      }
    }
  }
});

bot.on("callback_query", async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id.toString();
  
  if (data === "menu_apps" || data === "menu_produk") {
    const produk = loadProduk();
    if (produk.length === 0) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Belum ada produk tersedia.", show_alert: true });
    }
    
    const buttons = produk.map(p => ([{
      text: `${p.nama} (Stok: ${p.stok.length}) - Rp${p.harga.toLocaleString("id-ID")}`,
      callback_data: `buy_produk_${p.id}`
    }]));
    
    buttons.push([{ text: "🔙 Kembali", callback_data: "back_home" }]);
    
    const caption = `
<b>🛍️ DAFTAR PRODUK DIGITAL</b>
━━━━━━━━━━━━━━━━━━━━━
Silakan pilih produk yang ingin Anda beli:
`;
    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    });
  }
  
  if (data.startsWith("buy_produk_")) {
    const prodId = data.replace("buy_produk_", "");
    const db = loadProduk();
    const produk = db.find(p => p.id === prodId);
    
    if (!produk) return bot.answerCallbackQuery(query.id, { text: "❌ Produk tidak ditemukan.", show_alert: true });
    
    const caption = `
<b>• Produk :</b> ${produk.nama}
<b>• Sisa Stok :</b> ${produk.stok.length}
<b>• Deskripsi :</b> ${produk.deskripsi || '-'}

──────────────

<b>• Harga Satuan :</b> Rp${produk.harga.toLocaleString("id-ID")}

<i>Silakan klik tombol di bawah untuk membeli.</i>
`;
    
    const buttons = [
      [{ text: "💳 Beli Sekarang", callback_data: `input_qty_${prodId}` }],
      [{ text: "🔙 Kembali", callback_data: "menu_produk" }]
    ];
    
    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    });
  }
  
  if (data.startsWith("input_qty_")) {
    const prodId = data.replace("input_qty_", "");
    produkState[userId] = { step: "BUY_QTY", prodId: prodId };
    await bot.sendMessage(chatId, "🔢 <b>Masukkan Jumlah Yang Ingin Dibeli (Angka):</b>", { parse_mode: "HTML" });
    await bot.answerCallbackQuery(query.id);
  }
  
  if (data.startsWith("admin_del_produk_")) {
    if (userId !== owner) return;
    const prodId = data.replace("admin_del_produk_", "");
    let db = loadProduk();
    db = db.filter(p => p.id !== prodId);
    saveProduk(db);
    await bot.sendMessage(chatId, "✅ <b>Produk Berhasil Dihapus!</b>", { parse_mode: "HTML" });
  }
  
  if (data.startsWith("admin_add_stok_")) {
    if (userId !== owner) return;
    const prodId = data.replace("admin_add_stok_", "");
    produkState[userId] = { step: "ADD_STOK_CONTENT", prodId: prodId };
    await bot.sendMessage(chatId, "📥 <b>Kirim Data Stok (Bisa banyak baris):</b>", { parse_mode: "HTML" });
  }
  
  if (data.startsWith("admin_clear_stok_")) {
    if (userId !== owner) return;
    const prodId = data.replace("admin_clear_stok_", "");
    let db = loadProduk();
    const idx = db.findIndex(p => p.id === prodId);
    if (idx !== -1) {
      db[idx].stok = [];
      saveProduk(db);
      await bot.sendMessage(chatId, "✅ <b>Semua Stok Produk Ini Telah Dihapus!</b>", { parse_mode: "HTML" });
    }
  }
  
  if (data.startsWith("admin_edit_produk_")) {
    if (userId !== owner) return;
    const prodId = data.replace("admin_edit_produk_", "");
    produkState[userId] = { step: "EDIT_PRODUK_PRICE", prodId: prodId };
    await bot.sendMessage(chatId, "💰 <b>Kirim Harga Baru Untuk Produk Ini:</b>", { parse_mode: "HTML" });
  }
});

const setorTeleState = {};
const ownerSetorState = {};
let loginState = {};
let tempClients = {};
let wdState = {};

bot.on('callback_query', async (cb) => {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const userId = cb.from.id.toString();
    const config = require("./config.js");

    if (data === "setor_akun_menu") {
        const mtPath = "./database/maintenance.json";
        if (!fs.existsSync(mtPath)) fs.writeFileSync(mtPath, JSON.stringify({ setor: false }));
        const mtData = JSON.parse(fs.readFileSync(mtPath));

        if (mtData.setor && userId !== config.OWNER_ID.toString()) {
            return bot.answerCallbackQuery(cb.id, {
                text: "🚧 Fitur sedang Maintenance.",
                show_alert: true
            });
        }

        const setorPath = "./database/saldoSetor.json";
        if (!fs.existsSync(setorPath)) fs.writeFileSync(setorPath, JSON.stringify({}));
        
        const dbSetor = JSON.parse(fs.readFileSync(setorPath));
        const saldoSetor = dbSetor[userId] || 0;

        const caption = `
🤖 <b>MARKETPLACE & SETOR TELEGRAM</b>

💰 <b>Saldo Anda:</b> Rp ${saldoSetor.toLocaleString("id-ID")}

<b>MENU LAYANAN:</b>
🛒 <b>Beli Akun:</b> Stok akun siap pakai.
📥 <b>Setor Akun:</b> Jual akun Tele Anda ke bot.
💳 <b>Deposit:</b> Isi saldo.
💰 <b>Withdraw:</b> Tarik saldo hasil setor.
`;
        await bot.editMessageCaption(caption, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { 
                inline_keyboard: [
                    [
                        { text: "🛒 Beli Akun", callback_data: "menu_beli_tele" },
                        { text: "📥 Setor Akun", callback_data: "start_setor_tele" }
                    ],
                    [
                        { text: "💳 Deposit Saldo", callback_data: "depo_setor_req" },
                        { text: "💰 Tarik Saldo (WD)", callback_data: "wd_setor_req" }
                    ],
                    [{ text: "❌ Kembali", callback_data: "back_home" }] 
                ] 
            }
        }).catch(() => bot.sendMessage(chatId, caption, { parse_mode: "HTML" }));
        
        await bot.answerCallbackQuery(cb.id);
    }

    if (data === "menu_beli_tele") {
        const stokPath = "./database/stokAkun.json";
        if (!fs.existsSync(stokPath)) fs.writeFileSync(stokPath, JSON.stringify([]));
        const stokData = JSON.parse(fs.readFileSync(stokPath));

        const count = { "1": 0, "5": 0, "6": 0, "7": 0, "8": 0 };
        stokData.forEach(acc => {
            const digit = acc.phone.replace(/[^0-9]/g, "").substring(0, 1) === "6" ? 
                          acc.teleId.toString()[0] : "8"; 
            if (count[digit] !== undefined) count[digit]++;
            else count["8"]++;
        });

        const caption = `
🛒 <b>BELI AKUN TELEGRAM</b>

Stok tersedia:

🆔 <b>ID 1xxx</b> (Rp 35.000) indo- Sisa: ${count["1"]}
🆔 <b>ID 5xxx</b> (Rp 20.000) indo- Sisa: ${count["5"]}
🆔 <b>ID 6xxx</b> (Rp 15.000) indo- Sisa: ${count["6"]}
🆔 <b>ID 7xxx</b> (Rp 7.000) indo- Sisa: ${count["7"]}
🆔 <b>ID 8xxx</b> (Rp 7.000) indo- Sisa: ${count["8"]}

<i>Pilih akun yang ingin dibeli:</i>
`;
        const keyboard = [];
        if (count["1"] > 0) keyboard.push([{ text: `Beli ID 1xxx (Rp 35.000)`, callback_data: `buy_tele_1` }]);
        if (count["5"] > 0) keyboard.push([{ text: `Beli ID 5xxx (Rp 20.000)`, callback_data: `buy_tele_5` }]);
        if (count["6"] > 0) keyboard.push([{ text: `Beli ID 6xxx (Rp 15.000)`, callback_data: `buy_tele_6` }]);
        if (count["7"] > 0) keyboard.push([{ text: `Beli ID 7xxx (Rp 7.000)`, callback_data: `buy_tele_7` }]);
        if (count["8"] > 0) keyboard.push([{ text: `Beli ID 8xxx (Rp 7.000)`, callback_data: `buy_tele_8` }]);
        keyboard.push([{ text: "🔙 Kembali", callback_data: "setor_akun_menu" }]);

        await bot.editMessageCaption(caption, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard }
        });
        await bot.answerCallbackQuery(cb.id);
    }

    if (data === "start_setor_tele") {
        if (tempClients[userId]) {
            try { await tempClients[userId].disconnect(); } catch (e) {}
            delete tempClients[userId];
        }

        loginState[userId] = { step: "INPUT_PHONE" };
        
        await bot.editMessageCaption("📱 <b>MASUKKAN NOMOR HP</b>\n\nAwali dengan kode negara (contoh: +628xxx).\n\n<i>Ketik 'batal' atau klik tombol di bawah untuk membatalkan.</i>", {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "batal_setor" }]] }
        });
        await bot.answerCallbackQuery(cb.id);
    }

    if (data === "batal_setor") {
        if (tempClients[userId]) {
            try { await tempClients[userId].disconnect(); } catch (e) {}
            delete tempClients[userId];
        }
        
        delete loginState[userId];
        
        await bot.deleteMessage(chatId, messageId).catch(()=>{});
        await bot.sendMessage(chatId, "❌ Proses setor akun dibatalkan.", { reply_markup: { remove_keyboard: true } });
        await bot.answerCallbackQuery(cb.id);
    }

    if (data === "depo_setor_req") {
        wdState[userId] = { step: "INPUT_DEPO" };
        await bot.sendMessage(chatId, "💳 <b>DEPOSIT SALDO</b>\n\nSilakan masukkan <b>Nominal Deposit</b>.\nContoh: <code>20000</code>", { parse_mode: "HTML" });
        await bot.answerCallbackQuery(cb.id);
    }

    if (data === "wd_setor_req") {
        wdState[userId] = { step: "INPUT_NOMINAL_SETOR" };
        await bot.sendMessage(chatId, "💰 <b>PENARIKAN SALDO SETOR</b>\n\nSilakan masukkan <b>Nominal</b> yang ingin ditarik.\nContoh: <code>50000</code>", { parse_mode: "HTML" });
        await bot.answerCallbackQuery(cb.id);
    }
});

bot.on('message', async (msg) => {
    if (!msg.text || !msg.from) return;
    
    const userId = msg.from.id.toString();
    const chatId = msg.chat.id;
    const text = msg.text;
    const config = require("./config.js");
    const fs = require("fs");

    if (loginState[userId]) {
        const step = loginState[userId].step;

        if (step === "INPUT_PHONE") {
            let phoneNumber = text.trim();
            
            if (phoneNumber.startsWith("08")) {
                phoneNumber = "+62" + phoneNumber.slice(1);
            } else if (phoneNumber.startsWith("62")) {
                phoneNumber = "+" + phoneNumber;
            }

            if (!phoneNumber.startsWith("+")) {
                return bot.sendMessage(chatId, "⚠️ Format salah! Gunakan kode negara. Contoh: +628123456789", {
                    reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "batal_setor" }]] }
                });
            }

            const cleanInput = phoneNumber.replace(/[^0-9]/g, "");

            const historyPath = "./database/historySetor.json";
            const stokPath = "./database/stokAkun.json";
            
            if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify([]));
            if (!fs.existsSync(stokPath)) fs.writeFileSync(stokPath, JSON.stringify([]));

            const historyData = JSON.parse(fs.readFileSync(historyPath));
            const stokData = JSON.parse(fs.readFileSync(stokPath));

            const isDuplicateHistory = historyData.some(h => h.toString().replace(/[^0-9]/g, "") === cleanInput);
            const isDuplicateStok = stokData.some(a => a.phone.toString().replace(/[^0-9]/g, "") === cleanInput);

            if (isDuplicateHistory || isDuplicateStok) {
                delete loginState[userId];
                return bot.sendMessage(chatId, `❌ <b>NOMOR SUDAH ADA!</b>\n\nNomor <code>${phoneNumber}</code> sudah pernah disetor atau sedang dijual.\n\nMohon gunakan nomor lain.`, { 
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: [[{ text: "❌ Tutup", callback_data: "batal_setor" }]] }
                });
            }

            if (tempClients[userId]) {
                try { await tempClients[userId].disconnect(); } catch (e) {}
                delete tempClients[userId];
            }

            const loading = await bot.sendMessage(chatId, "⏳ Sedang menghubungkan ke server Telegram...", { parse_mode: "HTML" });

            try {
                const client = new TelegramClient(new StringSession(""), config.API_ID, config.API_HASH, {
                    connectionRetries: 5,
                    useWSS: true,
                });

                await client.connect();

                const { phoneCodeHash } = await client.sendCode({
                    apiId: config.API_ID,
                    apiHash: config.API_HASH,
                }, phoneNumber);

                tempClients[userId] = client;
                loginState[userId] = { 
                    step: "INPUT_CODE", 
                    phone: phoneNumber, 
                    phoneCodeHash: phoneCodeHash 
                };

                await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});
                return bot.sendMessage(chatId, `✅ <b>KODE TERKIRIM!</b>\n\nNomor: <code>${phoneNumber}</code>\n\nCek Telegram Anda. Masukkan kode OTP (Angka saja).`, { 
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "batal_setor" }]] }
                });

            } catch (err) {
                console.log(err);
                delete loginState[userId];
                if(tempClients[userId]) {
                    await tempClients[userId].disconnect();
                    delete tempClients[userId];
                }
                await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});
                
                let msgErr = err.message;
                if (err.message.includes("PHONE_NUMBER_INVALID")) msgErr = "Nomor tidak valid/banned.";
                
                return bot.sendMessage(chatId, `❌ <b>Gagal Mengirim OTP</b>\nError: ${msgErr}\n\nSilakan coba lagi.`, {
                    reply_markup: { inline_keyboard: [[{ text: "Coba Lagi", callback_data: "start_setor_tele" }]] }
                });
            }
        }

        if (step === "INPUT_CODE") {
            const code = text.trim();
            const client = tempClients[userId];

            if (!client) {
                delete loginState[userId];
                return bot.sendMessage(chatId, "⚠️ Sesi Habis. Silakan ulangi.", { 
                    reply_markup: { inline_keyboard: [[{ text: "Ulangi", callback_data: "start_setor_tele" }]] } 
                });
            }

            if (!code || isNaN(code)) {
                return bot.sendMessage(chatId, "⚠️ <b>Format Salah!</b>\nMasukkan kode OTP berupa angka saja.", { 
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "batal_setor" }]] }
                });
            }

            const loading = await bot.sendMessage(chatId, "⏳ Sedang login...", { parse_mode: "HTML" });

            try {
                await client.invoke(new Api.auth.SignIn({
                    phoneNumber: loginState[userId].phone,
                    phoneCodeHash: loginState[userId].phoneCodeHash,
                    phoneCode: code
                }));

                const sessionString = client.session.save();
                const me = await client.getMe();

                const sessionPath = "./database/sessionUser.json";
                if (!fs.existsSync(sessionPath)) fs.writeFileSync(sessionPath, JSON.stringify({}));
                let sessionData = JSON.parse(fs.readFileSync(sessionPath));
                sessionData[userId] = sessionString;
                fs.writeFileSync(sessionPath, JSON.stringify(sessionData));

                const historyPath = "./database/historySetor.json";
                if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify([]));
                let historyData = JSON.parse(fs.readFileSync(historyPath));
                if (!historyData.includes(me.phone)) {
                    historyData.push(me.phone);
                    fs.writeFileSync(historyPath, JSON.stringify(historyData));
                }

                const idStr = me.id.toString();
                const firstDigit = idStr[0];
                let hargaAkun = 3000;
                
                if (firstDigit === "1") hargaAkun = 13000;
                else if (firstDigit === "5") hargaAkun = 10000;
                else if (firstDigit === "6") hargaAkun = 7000;
                else if (firstDigit === "7") hargaAkun = 3000;
                else if (firstDigit === "8") hargaAkun = 3000;

                const stokPath = "./database/stokAkun.json";
                if (!fs.existsSync(stokPath)) fs.writeFileSync(stokPath, JSON.stringify([]));
                let stokData = JSON.parse(fs.readFileSync(stokPath));
                
                const akunId = Date.now().toString(); 
                stokData.push({
                    id: akunId,
                    userId: userId,
                    userNama: msg.from.first_name,
                    phone: me.phone,
                    teleId: idStr,
                    teleName: me.firstName || "Unknown",
                    session: sessionString,
                    password: "",
                    harga: hargaAkun,
                    status: "pending",
                    tanggal: new Date().toLocaleString("id-ID")
                });
                fs.writeFileSync(stokPath, JSON.stringify(stokData, null, 2));

                await client.disconnect();
                delete tempClients[userId];
                delete loginState[userId];

                await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});

                const report = `
📥 <b>SETOR AKUN BERHASIL</b>

👤 <b>Penyetor:</b> ${msg.from.first_name}
📱 <b>Nomor:</b> <code>${me.phone}</code>
💰 <b>Harga:</b> Rp ${hargaAkun.toLocaleString("id-ID")}
✅ <b>Status:</b> Masuk Database Stok

<i>Akun ini masuk list stok. Klik Terima untuk membayar user.</i>
`;
                await bot.sendMessage(config.OWNER_ID, report, { 
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: `✅ Terima (Bayar User)`, callback_data: `acc_auto_str_${akunId}` },
                                { text: "❌ Tolak", callback_data: `rej_auto_str_${userId}` }
                            ],
                            [
                                { text: "📂 Buka List Akun", callback_data: "buka_list_akun" }
                            ]
                        ]
                    }
                });

                return bot.sendMessage(chatId, `✅ <b>LOGIN SUKSES!</b>\n\n🆔 ID: <code>${idStr}</code>\n💰 Rate: Rp ${hargaAkun.toLocaleString("id-ID")}\n\nAkun berhasil disetor & masuk antrian pengecekan Owner.`, { parse_mode: "HTML" });

            } catch (err) {
                if (err.message.includes("SESSION_PASSWORD_NEEDED")) {
                    loginState[userId].step = "INPUT_PASSWORD";
                    await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});
                    return bot.sendMessage(chatId, "🔐 <b>AKUN TERKUNCI 2FA</b>\n\nSilakan masukkan Password Cloud (2FA) Anda:", { 
                        parse_mode: "HTML",
                        reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "batal_setor" }]] }
                    });
                } else if (err.message.includes("PHONE_CODE_EXPIRED")) {
                    await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});
                    return bot.sendMessage(chatId, "❌ <b>Kode Expired!</b>\nKode OTP hangus. Silakan ulang dari awal.", { 
                        parse_mode: "HTML",
                        reply_markup: { inline_keyboard: [[{ text: "Ulangi", callback_data: "start_setor_tele" }]] }
                    });
                } else {
                    console.log("Login Error:", err);
                    await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});
                    return bot.sendMessage(chatId, `❌ <b>Login Gagal:</b> ${err.message}`, { 
                        parse_mode: "HTML",
                        reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "batal_setor" }]] }
                    });
                }
            }
        }

        if (step === "INPUT_PASSWORD") {
            const password = text.trim();
            const client = tempClients[userId];

            if (!client) {
                 delete loginState[userId];
                 return bot.sendMessage(chatId, "⚠️ Sesi Habis. Ulangi dari awal.", { 
                     reply_markup: { inline_keyboard: [[{ text: "Ulangi", callback_data: "start_setor_tele" }]] }
                 });
            }

            const loading = await bot.sendMessage(chatId, "⏳ Verifikasi Password...", { parse_mode: "HTML" });

            try {
                const passwordParams = await client.invoke(new Api.account.GetPassword());
                const securityCheck = await computeCheck(passwordParams, password);
                await client.invoke(new Api.auth.CheckPassword({ password: securityCheck }));

                const sessionString = client.session.save();
                const me = await client.getMe();

                const sessionPath = "./database/sessionUser.json";
                if (!fs.existsSync(sessionPath)) fs.writeFileSync(sessionPath, JSON.stringify({}));
                let sessionData = JSON.parse(fs.readFileSync(sessionPath));
                sessionData[userId] = sessionString;
                fs.writeFileSync(sessionPath, JSON.stringify(sessionData));

                const historyPath = "./database/historySetor.json";
                if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify([]));
                let historyData = JSON.parse(fs.readFileSync(historyPath));
                if (!historyData.includes(me.phone)) {
                    historyData.push(me.phone);
                    fs.writeFileSync(historyPath, JSON.stringify(historyData));
                }

                const idStr = me.id.toString();
                const firstDigit = idStr[0];
                let hargaAkun = 3000;
                if (firstDigit === "1") hargaAkun = 35000;
                else if (firstDigit === "5") hargaAkun = 20000;
                else if (firstDigit === "6") hargaAkun = 15000;
                else if (firstDigit === "7") hargaAkun = 7000;
                else if (firstDigit === "8") hargaAkun = 7000;

                const stokPath = "./database/stokAkun.json";
                if (!fs.existsSync(stokPath)) fs.writeFileSync(stokPath, JSON.stringify([]));
                let stokData = JSON.parse(fs.readFileSync(stokPath));
                
                const akunId = Date.now().toString(); 
                stokData.push({
                    id: akunId,
                    userId: userId,
                    userNama: msg.from.first_name,
                    phone: me.phone,
                    teleId: idStr,
                    teleName: me.firstName || "Unknown",
                    session: sessionString,
                    password: password,
                    harga: hargaAkun,
                    status: "pending",
                    tanggal: new Date().toLocaleString("id-ID")
                });
                fs.writeFileSync(stokPath, JSON.stringify(stokData, null, 2));

                await client.disconnect();
                delete tempClients[userId];
                delete loginState[userId];

                await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});

                const report = `
📥 <b>SETOR AKUN BERHASIL (2FA)</b>

👤 <b>Penyetor:</b> ${msg.from.first_name}
📱 <b>Nomor:</b> <code>${me.phone}</code>
💰 <b>Harga:</b> Rp ${hargaAkun.toLocaleString("id-ID")}
✅ <b>Status:</b> Masuk Database Stok

<i>Akun ini masuk list stok. Klik Terima untuk membayar user.</i>
`;
                await bot.sendMessage(config.OWNER_ID, report, { 
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: `✅ Terima (Bayar User)`, callback_data: `acc_auto_str_${akunId}` },
                                { text: "❌ Tolak", callback_data: `rej_auto_str_${userId}` }
                            ],
                            [
                                { text: "📂 Buka List Akun", callback_data: "buka_list_akun" }
                            ]
                        ]
                    }
                });

                return bot.sendMessage(chatId, `✅ <b>LOGIN SUKSES!</b>\n\n🆔 ID: <code>${idStr}</code>\n💰 Rate: Rp ${hargaAkun.toLocaleString("id-ID")}\n\nAkun berhasil disetor & masuk antrian pengecekan Owner.`, { parse_mode: "HTML" });

            } catch (err) {
                console.log(err);
                await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});
                return bot.sendMessage(chatId, `❌ <b>Password Salah / Gagal:</b>\n${err.message}`, { 
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "batal_setor" }]] }
                });
            }
        }
    }
});

bot.on("callback_query", async (cb) => {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const userId = cb.from.id.toString();
    const ownerId = config.OWNER_ID.toString();

    if (data.startsWith("acc_wd_setor_")) {
        if (userId !== ownerId) {
            return bot.answerCallbackQuery(cb.id, { text: "❌ Khusus Owner!", show_alert: true });
        }

        const raw = data.replace("acc_wd_setor_", "").split("_");
        const targetId = raw[0];
        const nominal = parseInt(raw[1]);

        await bot.editMessageText(`✅ <b>WD SETOR SUKSES (DISETUJUI)</b>\n\nUser: <code>${targetId}</code>\nNominal: Rp ${nominal.toLocaleString("id-ID")}\nStatus: <i>Transfer Manual Selesai</i>`, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML"
        });

        await bot.sendMessage(targetId, `✅ <b>PENARIKAN SALDO SETOR BERHASIL!</b>\n\nDana sebesar <b>Rp ${nominal.toLocaleString("id-ID")}</b> telah ditransfer Owner ke akun Anda.\nTerima kasih!`, { parse_mode: "HTML" });
        await bot.answerCallbackQuery(cb.id, { text: "✅ Sukses Di-ACC" });
    }

    if (data.startsWith("rej_wd_setor_")) {
        if (userId !== ownerId) {
            return bot.answerCallbackQuery(cb.id, { text: "❌ Khusus Owner!", show_alert: true });
        }

        const raw = data.replace("rej_wd_setor_", "").split("_");
        const targetId = raw[0];
        const nominal = parseInt(raw[1]);

        const setorPath = "./database/saldoSetor.json";
        if (!fs.existsSync(setorPath)) fs.writeFileSync(setorPath, JSON.stringify({}));
        
        let dbSetor = JSON.parse(fs.readFileSync(setorPath));
        dbSetor[targetId] = (dbSetor[targetId] || 0) + nominal;
        fs.writeFileSync(setorPath, JSON.stringify(dbSetor, null, 2));

        await bot.editMessageText(`❌ <b>WD SETOR DITOLAK (REFUND)</b>\n\nUser: <code>${targetId}</code>\nNominal: Rp ${nominal.toLocaleString("id-ID")}\nStatus: <i>Saldo Dikembalikan</i>`, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML"
        });

        await bot.sendMessage(targetId, `❌ <b>PENARIKAN DITOLAK</b>\n\nPermintaan WD Rp ${nominal.toLocaleString("id-ID")} ditolak Owner.\nSaldo setor telah dikembalikan ke akun bot.`, { parse_mode: "HTML" });
        await bot.answerCallbackQuery(cb.id, { text: "❌ Ditolak & Refund" });
    }
});

bot.on("callback_query", async (cb) => {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const userId = cb.from.id.toString();
    const ownerId = config.OWNER_ID.toString();

    if (data.startsWith("acc_auto_str_")) {
        if (userId !== ownerId) return bot.answerCallbackQuery(cb.id, { text: "❌ Akses Ditolak!", show_alert: true });

        const akunId = data.replace("acc_auto_str_", "");
        const stokPath = "./database/stokAkun.json";
        
        if (!fs.existsSync(stokPath)) return bot.answerCallbackQuery(cb.id, { text: "Data stok kosong.", show_alert: true });
        
        let stokData = JSON.parse(fs.readFileSync(stokPath));
        const akunIndex = stokData.findIndex(a => a.id === akunId);
        
        if (akunIndex === -1) return bot.answerCallbackQuery(cb.id, { text: "Akun tidak ditemukan (mungkin sudah dihapus).", show_alert: true });
        
        const akun = stokData[akunIndex];
        
        if (akun.status === "paid") {
            return bot.answerCallbackQuery(cb.id, { text: "⚠️ Akun ini sudah dibayar sebelumnya!", show_alert: true });
        }

        const saldoPath = "./database/saldoSetor.json";
        if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}));
        let saldoData = JSON.parse(fs.readFileSync(saldoPath));
        
        saldoData[akun.userId] = (saldoData[akun.userId] || 0) + akun.harga;
        fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

        stokData[akunIndex].status = "paid";
        fs.writeFileSync(stokPath, JSON.stringify(stokData, null, 2));

        await bot.editMessageText(`✅ <b>SUKSES DIBAYAR!</b>\n\nStatus: <i>PAID (Saldo user ditambah)</i>\n💰 Harga: Rp ${akun.harga.toLocaleString("id-ID")}\n📱 Nomor: ${akun.phone}\n\n<i>Akun tetap tersimpan di List Akun.</i>`, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML"
        });

        await bot.sendMessage(akun.userId, `🎉 <b>AKUN BERHASIL DISETOR!</b>\n\nNomor: ${akun.phone}\n✅ Status: <b>Diterima Owner</b>\n💰 Saldo Setor Masuk: <b>Rp ${akun.harga.toLocaleString("id-ID")}</b>\n\n<i>Cek saldo di menu Setor Akun.</i>`, { parse_mode: "HTML" }).catch(()=>{});
        
        if (config.idchannel) {
            let maskedPhone = akun.phone;
            if (maskedPhone.length > 4) {
                maskedPhone = maskedPhone.slice(0, -4) + "xxxx";
            }

            const strukSetor = `
✅ *SETOR AKUN SUKSES*
━━━━━━━━━━━━━━━━━━━━━
👤 *Penyetor:* ${akun.userNama}
🆔 *ID:* \`${akun.userId}\`

📱 *Nomor:* \`${maskedPhone}\`
💰 *Harga Beli:* Rp ${akun.harga.toLocaleString("id-ID")}
✅ *Status:* Paid (Saldo Masuk)

📅 *Tanggal:* ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
━━━━━━━━━━━━━━━━━━━━━
`;
            bot.sendMessage(config.idchannel, strukSetor, { parse_mode: "Markdown" }).catch(() => {});
        }

        await bot.answerCallbackQuery(cb.id, { text: "✅ Berhasil Bayar User" });
    }

    if (data.startsWith("rej_auto_str_")) {
        if (userId !== ownerId) return bot.answerCallbackQuery(cb.id, { text: "❌ Akses Ditolak!", show_alert: true });

        const targetId = data.replace("rej_auto_str_", "");
        await bot.editMessageText(`❌ <b>DITOLAK!</b>\nStatus: <i>Rejected by Owner</i>`, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML"
        });

        await bot.sendMessage(targetId, `❌ <b>SETOR AKUN DITOLAK</b>\n\nMaaf, akun Anda tidak lolos pengecekan Owner.`, { parse_mode: "HTML" }).catch(()=>{});
        await bot.answerCallbackQuery(cb.id);
    }
});

bot.on("callback_query", async (cb) => {
    const data = cb.data;
    const userId = cb.from.id.toString();
    const ownerId = config.OWNER_ID.toString();

    if (data.startsWith("get_otp_owner_")) {
        if (userId !== ownerId) {
            return bot.answerCallbackQuery(cb.id, { text: "❌ Khusus Owner!", show_alert: true });
        }

        const targetUserId = data.replace("get_otp_owner_", "");
        const sessionPath = "./database/sessionUser.json";

        if (!fs.existsSync(sessionPath)) return bot.answerCallbackQuery(cb.id, { text: "❌ Database kosong.", show_alert: true });
        
        const sessionData = JSON.parse(fs.readFileSync(sessionPath));
        const userSession = sessionData[targetUserId];

        if (!userSession) {
            return bot.sendMessage(cb.message.chat.id, "❌ <b>Sesi Tidak Ditemukan!</b>\nMungkin akun sudah dihapus atau bot restart.", { parse_mode: "HTML" });
        }

        const loading = await bot.sendMessage(cb.message.chat.id, "⏳ <b>Sedang Mengambil OTP...</b>\nBot sedang login ke akun target...", { parse_mode: "HTML" });

        const passwordPath = "./database/passwordUser.json";
        let passwordText = "<i>Tidak ada (Login tanpa password)</i>";
        if (fs.existsSync(passwordPath)) {
            const pwdData = JSON.parse(fs.readFileSync(passwordPath));
            if (pwdData[targetUserId]) {
                passwordText = `<code>${pwdData[targetUserId]}</code>`;
            }
        }

        const client = new TelegramClient(new StringSession(userSession), config.API_ID, config.API_HASH, {
            connectionRetries: 5,
            useWSS: true,
        });

        try {
            await client.connect();

            const messages = await client.getMessages("777000", { limit: 1 });
            
            if (messages && messages.length > 0) {
                const lastMessage = messages[0].message;
                
                await bot.sendMessage(cb.message.chat.id, `🔐 <b>OTP DITEMUKAN!</b>\n\n----------------\n${lastMessage}\n----------------\n\n🔑 <b>Password 2FA:</b>\n${passwordText}\n\n<i>Silakan masukkan Kode OTP lalu Password (jika diminta).</i>`, { parse_mode: "HTML" });
            } else {
                await bot.sendMessage(cb.message.chat.id, "❌ <b>OTP Belum Masuk.</b>\nPastikan Owner sudah input nomornya di Telegram Owner, lalu coba klik tombol ini lagi.", { parse_mode: "HTML" });
            }

            await client.disconnect();
            await bot.deleteMessage(cb.message.chat.id, loading.message_id).catch(()=>{});

        } catch (err) {
            console.log(err);
            await bot.deleteMessage(cb.message.chat.id, loading.message_id).catch(()=>{});
            await bot.sendMessage(cb.message.chat.id, `❌ <b>Gagal:</b> ${err.message}`);
        }
    }
});

bot.onText(/\/list_akun/, async (msg) => {
    if (msg.from.id.toString() !== config.OWNER_ID.toString()) return;

    const stokPath = "./database/stokAkun.json";
    if (!fs.existsSync(stokPath)) return bot.sendMessage(msg.chat.id, "❌ Belum ada akun yang disetor.");

    const stokData = JSON.parse(fs.readFileSync(stokPath));
    if (stokData.length === 0) return bot.sendMessage(msg.chat.id, "📂 List Akun Kosong.");

    let keyboard = [];
    stokData.forEach((akun) => {
        keyboard.push([{ 
            text: `📱 ${akun.phone} | Rp ${akun.harga.toLocaleString("id-ID")}`, 
            callback_data: `cek_detail_${akun.id}` 
        }]);
    });

    await bot.sendMessage(msg.chat.id, `📂 <b>LIST AKUN TERSEDIA (${stokData.length})</b>\nKlik untuk melihat detail dan ambil OTP.`, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard }
    });
});

bot.on("callback_query", async (cb) => {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const ownerId = config.OWNER_ID.toString();
    const userId = cb.from.id.toString();

    if (data === "buka_list_akun") {
        if (userId !== ownerId) return;
        const stokPath = "./database/stokAkun.json";
        if (!fs.existsSync(stokPath)) return bot.sendMessage(chatId, "❌ Database kosong.");
        
        const stokData = JSON.parse(fs.readFileSync(stokPath));
        if (stokData.length === 0) return bot.sendMessage(chatId, "📂 List Akun Kosong.");

        let keyboard = [];
        stokData.forEach((akun) => {
            const statusIcon = akun.status === "paid" ? "✅" : "⚠️";
            keyboard.push([{ 
                text: `${statusIcon} ${akun.phone} | Rp ${akun.harga.toLocaleString("id-ID")}`, 
                callback_data: `cek_detail_${akun.id}` 
            }]);
        });
        
        await bot.sendMessage(chatId, "📂 <b>LIST STOK AKUN:</b>\n✅ = Sudah Dibayar\n⚠️ = Belum Dibayar", { reply_markup: { inline_keyboard: keyboard }, parse_mode: "HTML" });
        await bot.answerCallbackQuery(cb.id);
    }

    if (data.startsWith("cek_detail_")) {
        if (userId !== ownerId) return;

        const idAkun = data.replace("cek_detail_", "");
        const stokPath = "./database/stokAkun.json";
        const stokData = JSON.parse(fs.readFileSync(stokPath));
        const akun = stokData.find(a => a.id === idAkun);

        if (!akun) return bot.sendMessage(chatId, "❌ Data akun tidak ditemukan.");

        const statusText = akun.status === "paid" ? "✅ SUDAH DIBAYAR" : "⚠️ BELUM DIBAYAR";

        const detail = `
📱 <b>DETAIL AKUN</b>

Nomor: <code>${akun.phone}</code>
Status: <b>${statusText}</b>
Nama Tele: ${akun.teleName}
Password 2FA: <code>${akun.password}</code>
Harga: Rp ${akun.harga.toLocaleString("id-ID")}
Penyetor: ${akun.userNama}

⚠️ <b>TIPS:</b>
Akun ini aman di database. Anda bisa ambil OTP kapan saja.
`;
        const buttons = [
            [{ text: "📩 Minta OTP Login", callback_data: `req_otp_stok_${idAkun}` }],
            [{ text: "🗑 Hapus Akun", callback_data: `del_stok_${idAkun}` }],
            [{ text: "🔙 Kembali", callback_data: "buka_list_akun" }]
        ];

        if (akun.status !== "paid") {
            buttons.splice(1, 0, [{ text: "💰 Bayar User Manual", callback_data: `pay_manual_${idAkun}` }]);
        }

        await bot.editMessageText(detail, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: buttons }
        });
      }

   if (data.startsWith("pay_manual_")) {
        if (userId !== ownerId) return;
        const idAkun = data.replace("pay_manual_", "");
        const stokPath = "./database/stokAkun.json";
        let stokData = JSON.parse(fs.readFileSync(stokPath));
        const idx = stokData.findIndex(a => a.id === idAkun);

        if (idx === -1) return;
        const akun = stokData[idx];

        if (akun.status === "paid") return bot.answerCallbackQuery(cb.id, {text: "Sudah dibayar!", show_alert: true});

        const saldoPath = "./database/saldoSetor.json";
        if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}));
        let saldoData = JSON.parse(fs.readFileSync(saldoPath));
        
        saldoData[akun.userId] = (saldoData[akun.userId] || 0) + akun.harga;
        fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

        stokData[idx].status = "paid";
        fs.writeFileSync(stokPath, JSON.stringify(stokData, null, 2));

        await bot.answerCallbackQuery(cb.id, { text: "✅ Berhasil Dibayar Manual" });
        
        const detail = `
📱 <b>DETAIL AKUN</b>

Nomor: <code>${akun.phone}</code>
Status: <b>✅ SUDAH DIBAYAR</b>
Nama Tele: ${akun.teleName}
Password 2FA: <code>${akun.password}</code>
Harga: Rp ${akun.harga.toLocaleString("id-ID")}
Penyetor: ${akun.userNama}
`;
        const buttons = [
            [{ text: "📩 Minta OTP Login", callback_data: `req_otp_stok_${idAkun}` }],
            [{ text: "🗑 Hapus Akun", callback_data: `del_stok_${idAkun}` }],
            [{ text: "🔙 Kembali", callback_data: "buka_list_akun" }]
        ];

        await bot.editMessageText(detail, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: buttons }
        });

        await bot.sendMessage(akun.userId, `🎉 <b>AKUN ANDA TELAH DIBAYAR!</b>\n\nNomor: ${akun.phone}\n💰 Saldo Masuk: <b>Rp ${akun.harga.toLocaleString("id-ID")}</b>`, { parse_mode: "HTML" }).catch(()=>{});
    }
    
    if (data.startsWith("req_otp_stok_")) {
        if (userId !== ownerId) return;
        const idAkun = data.replace("req_otp_stok_", "");
        const stokPath = "./database/stokAkun.json";
        const stokData = JSON.parse(fs.readFileSync(stokPath));
        const akun = stokData.find(a => a.id === idAkun);

        if (!akun) return bot.sendMessage(chatId, "❌ Akun hilang.");

        const loading = await bot.sendMessage(chatId, "⏳ <b>Menghubungkan ke sesi...</b>", { parse_mode: "HTML" });

        const client = new TelegramClient(new StringSession(akun.session), config.API_ID, config.API_HASH, {
            connectionRetries: 5,
            useWSS: true,
        });

        try {
            await client.connect();
            const messages = await client.getMessages("777000", { limit: 1 });
            
            if (messages && messages.length > 0) {
                const lastMessage = messages[0].message;
                await bot.sendMessage(chatId, `🔐 <b>OTP DITEMUKAN!</b>\n\nNomor: <code>${akun.phone}</code>\nPassword: <code>${akun.password}</code>\n\nPesan:\n----------------\n${lastMessage}\n----------------`, { parse_mode: "HTML" });
            } else {
                await bot.sendMessage(chatId, "❌ <b>OTP Belum Masuk.</b>\nPastikan sudah input nomor di Telegram, lalu klik Minta OTP lagi.", { parse_mode: "HTML" });
            }

            await client.disconnect();
            await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});

        } catch (err) {
            await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});
            await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
        }
    }

    if (data.startsWith("done_stok_")) {
        if (userId !== ownerId) return;
        
        const idAkun = data.replace("done_stok_", "");
        const stokPath = "./database/stokAkun.json";
        let stokData = JSON.parse(fs.readFileSync(stokPath));
        const akunIndex = stokData.findIndex(a => a.id === idAkun);
        
        if (akunIndex === -1) return;
        const akun = stokData[akunIndex];

        const setorPath = "./database/saldoSetor.json";
        if (!fs.existsSync(setorPath)) fs.writeFileSync(setorPath, JSON.stringify({}));
        let dbSetor = JSON.parse(fs.readFileSync(setorPath));
        dbSetor[akun.userId] = (dbSetor[akun.userId] || 0) + akun.harga;
        fs.writeFileSync(setorPath, JSON.stringify(dbSetor, null, 2));

        stokData.splice(akunIndex, 1);
        fs.writeFileSync(stokPath, JSON.stringify(stokData, null, 2));

        await bot.sendMessage(cb.message.chat.id, `✅ <b>AKUN SELESAI!</b>\nSaldo Setor User +Rp ${akun.harga.toLocaleString("id-ID")}\nData dihapus dari list.`, { parse_mode: "HTML" });
        await bot.sendMessage(akun.userId, `🎉 <b>AKUN ANDA SUDAH BERHASIL DIPROSES!</b>\n\nNomor: ${akun.phone}\n✅ Status: <b>Diterima Owner</b>\n💰 Saldo Setor Masuk: <b>Rp ${akun.harga.toLocaleString("id-ID")}</b>\n\n<i>Cek saldo di menu Setor Akun.</i>`, { parse_mode: "HTML" });
        
        await bot.deleteMessage(cb.message.chat.id, cb.message.message_id).catch(()=>{});
    }


    if (data.startsWith("del_stok_")) {
        if (userId !== ownerId) return;

        const idAkun = data.replace("del_stok_", "");
        const stokPath = "./database/stokAkun.json";
        let stokData = JSON.parse(fs.readFileSync(stokPath));
        const akunIndex = stokData.findIndex(a => a.id === idAkun);

        if (akunIndex !== -1) {
            const akun = stokData[akunIndex];
            stokData.splice(akunIndex, 1);
            fs.writeFileSync(stokPath, JSON.stringify(stokData, null, 2));
            
            await bot.sendMessage(chatId, "🗑 Akun berhasil dihapus permanen.");
            
            const keyboard = [];
            stokData.forEach((akun) => {
                const statusIcon = akun.status === "paid" ? "✅" : "⚠️";
                keyboard.push([{ text: `${statusIcon} ${akun.phone}`, callback_data: `cek_detail_${akun.id}` }]);
            });
            await bot.sendMessage(chatId, "📂 <b>LIST STOK AKUN:</b>", { reply_markup: { inline_keyboard: keyboard }, parse_mode: "HTML" });
        }
        await bot.deleteMessage(chatId, messageId).catch(()=>{});
    }
});


bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const text = msg.text || "";

    if (wdState[userId]) {
        const step = wdState[userId].step;

        if (step === "INPUT_NOMINAL_SETOR") {
            const nominal = parseInt(text.replace(/[^0-9]/g, ""));
            
            if (isNaN(nominal) || nominal < 1000) {
                return bot.sendMessage(chatId, "⚠️ Minimal WD Rp 1.000. Masukkan angka saja.");
            }

            const setorPath = "./database/saldoSetor.json";
            if (!fs.existsSync(setorPath)) fs.writeFileSync(setorPath, JSON.stringify({}));
            const dbSetor = JSON.parse(fs.readFileSync(setorPath));
            const saldoSetor = dbSetor[userId] || 0;

            if (nominal > saldoSetor) {
                delete wdState[userId];
                return bot.sendMessage(chatId, `❌ <b>Saldo Setor Tidak Cukup!</b>\nSaldo Anda: Rp ${saldoSetor.toLocaleString("id-ID")}\n\nSilakan setor akun dulu.`, { parse_mode: "HTML" });
            }

            wdState[userId] = { step: "INPUT_TARGET_SETOR", nominal: nominal };
            return bot.sendMessage(chatId, `✅ Nominal: Rp ${nominal.toLocaleString("id-ID")}\n\nSekarang masukkan <b>Nomor DANA / E-Wallet</b> tujuan.\nContoh: <i>DANA & ATAS NAMA PEMILIK 08123456789</i>`, { parse_mode: "HTML" });
        }

        if (step === "INPUT_TARGET_SETOR") {
            const target = text.trim();
            const nominal = wdState[userId].nominal;

            const setorPath = "./database/saldoSetor.json";
            let dbSetor = JSON.parse(fs.readFileSync(setorPath));
            
            dbSetor[userId] -= nominal;
            fs.writeFileSync(setorPath, JSON.stringify(dbSetor, null, 2));

            delete wdState[userId];

            await bot.sendMessage(chatId, "⏳ <b>Permintaan WD Terkirim!</b>\nMohon tunggu Owner memproses transfer Anda.", { parse_mode: "HTML" });

            const laporan = `
💸 <b>REQUEST WD (SALDO SETOR)</b>

👤 <b>User:</b> ${msg.from.first_name} (ID: <code>${userId}</code>)
💰 <b>Nominal:</b> Rp ${nominal.toLocaleString("id-ID")}
💳 <b>Tujuan:</b> <code>${target}</code>

<i>Sisa Saldo Setor User: Rp ${(dbSetor[userId]).toLocaleString("id-ID")}</i>
`;
            
            await bot.sendMessage(config.OWNER_ID, laporan, {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Sudah TF", callback_data: `acc_wd_setor_${userId}_${nominal}` },
                            { text: "❌ Tolak (Refund)", callback_data: `rej_wd_setor_${userId}_${nominal}` }
                        ]
                    ]
                }
            });
        }

        if (step === "INPUT_DEPO") {
            const nominal = parseInt(text.replace(/[^0-9]/g, ""));
            if (isNaN(nominal) || nominal < 1000) return bot.sendMessage(chatId, "⚠️ Nominal minimal Rp 1.000.");

            wdState[userId] = { step: "UPLOAD_BUKTI", nominal: nominal };

            const infoBayar = PAYMENT_INFO || `
💳 <b>INFO PEMBAYARAN</b>

💰 <b>Total:</b> Rp ${nominal.toLocaleString("id-ID")}

Silakan transfer ke:
🔹 <b>DANA:</b> ${config.danapay}
🔹 <b>QRIS:</b> ${config.qrispay}

⚠️ <b>PENTING:</b> Setelah Tf WAJIB kirim bukti transfer ke sini.`;
            
            const bannerUrl = config.ppthumb; 

            await bot.sendPhoto(chatId, bannerUrl, {
                caption: infoBayar,
                parse_mode: "HTML"
            });
        }

        if (step === "UPLOAD_BUKTI") {
            if (!msg.photo) {
                return bot.sendMessage(chatId, "❌ Harap kirimkan <b>GAMBAR/FOTO</b> bukti transfer, bukan teks.", { parse_mode: "HTML" });
            }

            const nominal = wdState[userId].nominal;
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const captionUser = msg.caption || "-";

            await bot.sendMessage(chatId, "⏳ <b>Bukti Diterima!</b>\nMohon tunggu Owner memverifikasi bukti transfer Anda. Saldo akan masuk otomatis jika disetujui.", { parse_mode: "HTML" });

            const captionOwner = `
💳 <b>BUKTI DEPOSIT BARU</b>

👤 User: ${msg.from.first_name} (ID: <code>${userId}</code>)
💰 Nominal: <b>Rp ${nominal.toLocaleString("id-ID")}</b>
📝 Catatan: ${captionUser}

<i>Silakan cek mutasi. Klik Terima jika dana masuk.</i>
`;
            
            await bot.sendPhoto(config.OWNER_ID, fileId, {
                caption: captionOwner,
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ Terima (Masuk Saldo)", callback_data: `acc_depo_${userId}_${nominal}` }],
                        [{ text: "❌ Tolak (Bukti Palsu)", callback_data: `rej_depo_${userId}` }]
                    ]
                }
            });

            delete wdState[userId];
        }
        return;
    }
});

bot.on("callback_query", async (cb) => {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const userId = cb.from.id.toString();
    const config = require("./config.js");
    const fs = require("fs");

    if (data.startsWith("acc_depo_")) {
        if (userId !== config.OWNER_ID.toString()) {
            return bot.answerCallbackQuery(cb.id, { text: "❌ Akses Ditolak! Hanya Owner.", show_alert: true });
        }

        const raw = data.replace("acc_depo_", "").split("_");
        const targetUserId = raw[0];
        const nominal = parseInt(raw[1]);

        const setorPath = "./database/saldoSetor.json";
        if (!fs.existsSync(setorPath)) fs.writeFileSync(setorPath, JSON.stringify({}));
        
        let dbSetor = JSON.parse(fs.readFileSync(setorPath));
        const saldoAwal = dbSetor[targetUserId] || 0;
        dbSetor[targetUserId] = saldoAwal + nominal;
        fs.writeFileSync(setorPath, JSON.stringify(dbSetor, null, 2));

        await bot.editMessageCaption(
            `✅ <b>DEPOSIT DITERIMA</b>\n\n👤 User: <code>${targetUserId}</code>\n💰 Nominal: Rp ${nominal.toLocaleString("id-ID")}\n\n<i>Saldo user berhasil ditambahkan.</i>`, 
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "HTML"
            }
        );

        await bot.sendMessage(targetUserId, 
            `✅ <b>DEPOSIT BERHASIL!</b>\n\nSaldo sebesar <b>Rp ${nominal.toLocaleString("id-ID")}</b> telah ditambahkan ke akun Anda.\n\n💰 Total Saldo: Rp ${(saldoAwal + nominal).toLocaleString("id-ID")}`, 
            { parse_mode: "HTML" }
        ).catch(()=>{});

        await bot.answerCallbackQuery(cb.id, { text: "✅ Saldo Masuk" });
    }

    if (data.startsWith("rej_depo_")) {
        if (userId !== config.OWNER_ID.toString()) {
            return bot.answerCallbackQuery(cb.id, { text: "❌ Akses Ditolak!", show_alert: true });
        }

        const targetUserId = data.replace("rej_depo_", "");

        await bot.editMessageCaption(
            `❌ <b>DEPOSIT DITOLAK</b>\n\n👤 User: <code>${targetUserId}</code>\n\n<i>Bukti pembayaran dianggap tidak valid.</i>`, 
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "HTML"
            }
        );

        await bot.sendMessage(targetUserId, 
            `❌ <b>DEPOSIT DITOLAK</b>\n\nBukti transfer Anda tidak valid atau dana belum masuk mutasi. Silakan hubungi Admin jika ini kesalahan.`, 
            { parse_mode: "HTML" }
        ).catch(()=>{});

        await bot.answerCallbackQuery(cb.id, { text: "❌ Deposit Ditolak" });
    }
});

bot.on("callback_query", async (cb) => {
    try {
        const data = cb.data;
        const chatId = cb.message.chat.id;
        const messageId = cb.message.message_id; 
        const userId = cb.from.id.toString();
        const config = require("./config.js");
        const fs = require("fs");
        const { TelegramClient } = require("telegram");
        const { StringSession } = require("telegram/sessions");

        if (data.startsWith("buy_tele_")) {
            const digit = data.replace("buy_tele_", "");
            const prices = { "1": 35000, "5": 20000, "6": 15000, "7": 7000, "8": 7000 };
            const price = prices[digit] || 7000;

            const stokPath = "./database/stokAkun.json";
            if (!fs.existsSync(stokPath)) fs.writeFileSync(stokPath, JSON.stringify([]));
            let stokData = JSON.parse(fs.readFileSync(stokPath));
            
            const checkStok = stokData.find(acc => acc.teleId.toString().startsWith(digit));

            if (!checkStok) {
                return bot.answerCallbackQuery(cb.id, { text: "❌ Stok untuk ID tersebut habis.", show_alert: true });
            }

            const confirmMsg = `
🛒 <b>KONFIRMASI PEMBELIAN</b>

Apakah Anda yakin ingin membeli akun ini?

🆔 <b>Kategori ID:</b> ${digit}xxx
💰 <b>Harga:</b> Rp ${price.toLocaleString("id-ID")}
📦 <b>Status:</b> Tersedia

<i>Saldo akan terpotong otomatis setelah Anda menekan tombol Beli.</i>
`;
            
            await bot.deleteMessage(chatId, messageId).catch(()=>{});

            const markup = {
                inline_keyboard: [
                    [{ text: "✅ Beli Sekarang", callback_data: `acc_buy_${digit}` }],
                    [{ text: "❌ Batal", callback_data: "setor_akun_menu" }]
                ]
            };

            if (config.ppthumb) {
                await bot.sendPhoto(chatId, config.ppthumb, { 
                    caption: confirmMsg, 
                    parse_mode: "HTML", 
                    reply_markup: markup 
                }).catch(async () => {
                    await bot.sendMessage(chatId, confirmMsg, { parse_mode: "HTML", reply_markup: markup });
                });
            } else {
                await bot.sendMessage(chatId, confirmMsg, { parse_mode: "HTML", reply_markup: markup });
            }
        }
        
        if (data.startsWith("acc_buy_")) {
            const digit = data.replace("acc_buy_", "");
            const prices = { "1": 35000, "5": 20000, "6": 15000, "7": 7000, "8": 7000 };
            const price = prices[digit] || 7000;

            const setorPath = "./database/saldoSetor.json";
            if (!fs.existsSync(setorPath)) fs.writeFileSync(setorPath, JSON.stringify({}));
            let dbSetor = JSON.parse(fs.readFileSync(setorPath));
            const saldoUser = dbSetor[userId] || 0;

            if (saldoUser < price) {
                return bot.answerCallbackQuery(cb.id, { 
                    text: `❌ Saldo Kurang! Butuh Rp ${price.toLocaleString("id-ID")}.`, 
                    show_alert: true 
                });
            }

            const stokPath = "./database/stokAkun.json";
            let stokData = JSON.parse(fs.readFileSync(stokPath));
            const akunIndex = stokData.findIndex(acc => acc.teleId.toString().startsWith(digit));

            if (akunIndex === -1) {
                return bot.answerCallbackQuery(cb.id, { text: "❌ Yah, stok baru saja diambil orang lain.", show_alert: true });
            }

            const akun = stokData[akunIndex];

            dbSetor[userId] -= price;
            fs.writeFileSync(setorPath, JSON.stringify(dbSetor, null, 2));

            const soldPath = "./database/soldSession.json";
            if (!fs.existsSync(soldPath)) fs.writeFileSync(soldPath, JSON.stringify({}));
            let soldData = JSON.parse(fs.readFileSync(soldPath));
            
            soldData[akun.id] = {
                ...akun,
                buyerId: userId,
                soldDate: new Date().toLocaleString("id-ID")
            };
            fs.writeFileSync(soldPath, JSON.stringify(soldData, null, 2));

            stokData.splice(akunIndex, 1);
            fs.writeFileSync(stokPath, JSON.stringify(stokData, null, 2));

            if (config.idchannel) {
                const buyerName = cb.from.username ? `@${cb.from.username}` : cb.from.first_name;
                
                let maskedPhone = akun.phone;
                if (maskedPhone.length > 4) {
                    maskedPhone = maskedPhone.slice(0, -4) + "xxxx";
                }

                const strukBeli = `
🛒 *PEMBELIAN AKUN SUKSES*
━━━━━━━━━━━━━━━━━━━━━
👤 *Buyer:* ${buyerName}
🆔 *ID:* \`${userId}\`

📱 *Nomor:* \`${maskedPhone}\`
💰 *Harga:* Rp ${price.toLocaleString("id-ID")}
📦 *Kategori ID:* ${digit}xxx

📅 *Tanggal:* ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
━━━━━━━━━━━━━━━━━━━━━
`;
                bot.sendMessage(config.idchannel, strukBeli, { parse_mode: "Markdown" }).catch(() => {});
            }

            const struk = `
✅ <b>PEMBELIAN BERHASIL!</b>

📱 <b>Nomor:</b> <code>${akun.phone}</code>
🔐 <b>Password 2FA:</b> <code>${akun.password || "Tidak ada"}</code>
💰 <b>Harga:</b> Rp ${price.toLocaleString("id-ID")}

⚠️ <b>PANDUAN LOGIN:</b>
1. Masukkan Nomor <code>${akun.phone}</code> di Telegram Anda.
2. Saat Telegram meminta kode, Klik tombol <b>📩 Minta OTP Login</b> di bawah ini.
3. Bot akan mengambilkan kode OTP untuk Anda.
`;
            
            await bot.editMessageCaption(struk, {
                chat_id: chatId,
                message_id: messageId, 
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📩 Minta OTP Login", callback_data: `req_otp_buy_${akun.id}` }],
                        [{ text: "🔙 Kembali", callback_data: "setor_akun_menu" }]
                    ]
                }
            }).catch(async () => {
                await bot.sendMessage(chatId, struk, { parse_mode: "HTML" });
            });
        }
        
        if (data.startsWith("req_otp_buy_")) {
            const idAkun = data.replace("req_otp_buy_", "");
            const soldPath = "./database/soldSession.json";
            
            if (!fs.existsSync(soldPath)) return bot.answerCallbackQuery(cb.id, { text: "Database Error.", show_alert: true });
            
            const soldData = JSON.parse(fs.readFileSync(soldPath));
            const akun = soldData[idAkun];

            if (!akun) return bot.sendMessage(chatId, "❌ Data akun tidak ditemukan.");
            if (akun.buyerId !== userId) return bot.answerCallbackQuery(cb.id, { text: "❌ Ini bukan akun Anda!", show_alert: true });

            const loading = await bot.sendMessage(chatId, "⏳ <b>Sedang menghubungkan ke server Telegram...</b>", { parse_mode: "HTML" });

            const client = new TelegramClient(new StringSession(akun.session), config.API_ID, config.API_HASH, {
                connectionRetries: 5,
                useWSS: true,
            });

            try {
                await client.connect();
                const messages = await client.getMessages("777000", { limit: 1 });

                if (messages && messages.length > 0) {
                    const lastMessage = messages[0].message;
                    await bot.sendMessage(chatId, 
                        `🔐 <b>KODE LOGIN DITEMUKAN!</b>\n\n` +
                        `Nomor: <code>${akun.phone}</code>\n` +
                        `Password 2FA: <code>${akun.password}</code>\n\n` +
                        `👇 <b>Isi Pesan dari Telegram:</b>\n` +
                        `-----------------------------\n` +
                        `${lastMessage}\n` +
                        `-----------------------------`, 
                        { parse_mode: "HTML" }
                    );
                } else {
                    await bot.sendMessage(chatId, 
                        "⚠️ <b>OTP Belum Masuk.</b>\n\nPastikan Anda sudah memasukkan nomor di aplikasi Telegram dan menekan 'Send Code'.\n\n<i>Coba klik tombol Minta OTP lagi dalam 10 detik.</i>", 
                        { parse_mode: "HTML" }
                    );
                }
                
                await client.disconnect();
                await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});

            } catch (err) {
                await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});
                await bot.sendMessage(chatId, `❌ <b>Gagal Mengambil OTP:</b>\n${err.message}\n\nMungkin sesi akun sudah mati/logout.`);
            }
        }

    } catch (error) {
        console.log("Error Callback Beli:", error);
    }
});

let reportState = {};

bot.on("callback_query", async (cb) => {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const userId = cb.from.id.toString();
    const config = require("./config.js");

    if (data === "menu_lapor_scam") {
        reportState[userId] = { 
            step: "WAIT_PHOTO", 
            photos: [], 
            pelaku: "", 
            korban: "", 
            nominal: "", 
            kronologi: "" 
        };

        const caption = `
📸 <b>STEP 1: BUKTI FOTO</b>

Silakan kirimkan <b>FOTO/SCREENSHOT</b> bukti chat atau transfer.
Anda bisa mengirim lebih dari 1 foto.

<i>Jika sudah selesai kirim foto, tekan tombol "Lanjut" di bawah.</i>
`;
        await bot.editMessageCaption(caption, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "➡️ Lanjut Step Berikutnya", callback_data: "report_next_step" }],
                    [{ text: "❌ Batal", callback_data: "cancel_report" }]
                ]
            }
        }).catch(async () => {
             await bot.sendMessage(chatId, caption, {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "➡️ Lanjut Step Berikutnya", callback_data: "report_next_step" }],
                        [{ text: "❌ Batal", callback_data: "cancel_report" }]
                    ]
                }
            });
        });
        await bot.answerCallbackQuery(cb.id);
    }

    if (data === "report_next_step") {
        if (!reportState[userId] || reportState[userId].photos.length === 0) {
            return bot.answerCallbackQuery(cb.id, { text: "⚠️ Kirim minimal 1 foto bukti dulu!", show_alert: true });
        }

        reportState[userId].step = "WAIT_PELAKU";
        
        await bot.sendMessage(chatId, "👤 <b>STEP 2: DATA PELAKU</b>\n\nSiapa Pelakunya? (Username/Nama/No HP/Rekening)\n\n<i>Silakan ketik balas pesan ini...</i>", {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [[{ text: "❌ Batal", callback_data: "cancel_report" }]]
            }
        });
        await bot.answerCallbackQuery(cb.id);
    }

    if (data === "cancel_report") {
        if (reportState[userId]) delete reportState[userId];
        await bot.deleteMessage(chatId, messageId).catch(()=>{});
        await bot.sendMessage(chatId, "❌ Laporan dibatalkan.", { reply_markup: { remove_keyboard: true } });
        await bot.answerCallbackQuery(cb.id);
    }
});

bot.on("message", async (msg) => {
    const userId = msg.from.id.toString();
    const chatId = msg.chat.id;
    const config = require("./config.js");

    if (reportState[userId]) {
        const step = reportState[userId].step;

        if (step === "WAIT_PHOTO") {
            if (msg.photo) {
                const fileId = msg.photo[msg.photo.length - 1].file_id;
                reportState[userId].photos.push(fileId);
                const jumlah = reportState[userId].photos.length;

                await bot.sendMessage(chatId, `✅ <b>Foto ke-${jumlah} diterima.</b>\nKirim foto lagi atau klik Lanjut jika sudah cukup.`, {
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "➡️ Lanjut Step Berikutnya", callback_data: "report_next_step" }],
                            [{ text: "❌ Batal", callback_data: "cancel_report" }]
                        ]
                    }
                });
            } else {
                await bot.sendMessage(chatId, "⚠️ <b>Harap kirim FOTO.</b>\nJika sudah selesai, tekan tombol Lanjut di atas.", {
                     parse_mode: "HTML",
                     reply_markup: {
                        inline_keyboard: [[{ text: "❌ Batal", callback_data: "cancel_report" }]]
                    }
                });
            }
            return;
        }

        if (step === "WAIT_PELAKU") {
            if (!msg.text) return bot.sendMessage(chatId, "⚠️ Harap kirim teks.");
            
            reportState[userId].pelaku = msg.text;
            reportState[userId].step = "WAIT_KORBAN";

            await bot.sendMessage(chatId, "👥 <b>STEP 3: DATA KORBAN</b>\n\nSiapa Korbannya? (Nama Anda/Username)", {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [[{ text: "❌ Batal", callback_data: "cancel_report" }]]
                }
            });
            return;
        }

        if (step === "WAIT_KORBAN") {
            if (!msg.text) return bot.sendMessage(chatId, "⚠️ Harap kirim teks.");

            reportState[userId].korban = msg.text;
            reportState[userId].step = "WAIT_NOMINAL";

            await bot.sendMessage(chatId, "💰 <b>STEP 4: TOTAL KERUGIAN</b>\n\nBerapa total kerugiannya?\nContoh: <i>Rp 50.000</i>", {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [[{ text: "❌ Batal", callback_data: "cancel_report" }]]
                }
            });
            return;
        }

        if (step === "WAIT_NOMINAL") {
            if (!msg.text) return bot.sendMessage(chatId, "⚠️ Harap kirim teks.");

            reportState[userId].nominal = msg.text;
            reportState[userId].step = "WAIT_KRONOLOGI";

            await bot.sendMessage(chatId, "📝 <b>STEP 5: KRONOLOGI (TERAKHIR)</b>\n\nCeritakan kronologi kejadian secara singkat & jelas.", {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [[{ text: "❌ Batal", callback_data: "cancel_report" }]]
                }
            });
            return;
        }

        if (step === "WAIT_KRONOLOGI") {
            if (!msg.text) return bot.sendMessage(chatId, "⚠️ Harap kirim teks.");
            
            reportState[userId].kronologi = msg.text;

            const dataLapor = reportState[userId];
            const channelTujuan = config.channelscammer;

            const captionFinal = `
📢 <b>LAPORAN INFORMASI SCAMMER</b>
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

👤 <b>PELAKU:</b> ${dataLapor.pelaku}
👥 <b>KORBAN:</b> ${dataLapor.korban}
💰 <b>TOTAL:</b> ${dataLapor.nominal}

📜 <b>DETAIL KRONOLOGI:</b>
<i>"${dataLapor.kronologi}"</i>
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
🚨 <b>Peringatan:</b> <i>Mohon berhati-hati dengan orang tersebut. Selalu gunakan Rekber terpercaya!</i>
            `;

            const loading = await bot.sendMessage(chatId, "⏳ Mengirim laporan ke channel...");

            try {
                const mediaGroup = dataLapor.photos.map((fileId, index) => {
                    const media = {
                        type: 'photo',
                        media: fileId
                    };
                    if (index === 0) {
                        media.caption = captionFinal;
                        media.parse_mode = 'HTML';
                    }
                    return media;
                });

                if (channelTujuan) {
                    await bot.sendMediaGroup(channelTujuan, mediaGroup);
                }

                await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});
                await bot.sendMessage(chatId, "✅ <b>Laporan Berhasil Terkirim!</b>\nTerima kasih telah melapor.", { parse_mode: "HTML" });

            } catch (err) {
                console.error(err);
                await bot.deleteMessage(chatId, loading.message_id).catch(()=>{});
                await bot.sendMessage(chatId, "❌ Gagal mengirim laporan. Coba lagi nanti.");
            }

            delete reportState[userId];
            return;
        }
    }
});

const panelSession = {};

async function createPanelAccount(username, ram, disk, cpu) {
    try {
        const domain = config.panel.domain;
        const plta = config.panel.plta;
        const pltc = config.panel.pltc;
        
        const headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${plta}`
        };

        const randomStr = Math.floor(Math.random() * 9999);
        const password = username + randomStr;
        const email = `${username.toLowerCase()}${randomStr}@panel.com`;

        let userResult;
        try {
            const userRes = await axios.post(`${domain}/api/application/users`, {
                email: email,
                username: username.toLowerCase() + randomStr,
                first_name: username,
                last_name: "User",
                language: "en",
                password: password
            }, { headers });
            userResult = userRes.data.attributes;
        } catch (e) {
            return { success: false, msg: e.response?.data?.errors?.[0]?.detail || e.message };
        }

        const serverRes = await axios.post(`${domain}/api/application/servers`, {
            name: `${username} Server`,
            user: userResult.id,
            egg: parseInt(config.panel.egg),
            docker_image: config.panel.image,
            startup: config.panel.startup,
            environment: {
                INST: "npm",
                USER_UPLOAD: "0",
                AUTO_UPDATE: "0",
                CMD_RUN: "npm start"
            },
            limits: {
                memory: ram,
                swap: 0,
                disk: disk,
                io: 500,
                cpu: cpu
            },
            feature_limits: {
                databases: 1,
                backups: 1,
                allocations: 1
            },
            deploy: {
                locations: [parseInt(config.panel.loc)],
                dedicated_ip: false,
                port_range: []
            }
        }, { headers });

        return {
            success: true,
            data: {
                username: userResult.username,
                password: password,
                login: domain,
                ram: ram,
                disk: disk,
                cpu: cpu,
                plta: plta,
                pltc: pltc
            }
        };

    } catch (error) {
        return { 
            success: false, 
            msg: error.response?.data?.errors?.[0]?.detail || error.message 
        };
    }
}

bot.on("callback_query", async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const userId = query.from.id;

    if (data === "menu_panel") {
        const pricePerGb = config.hargaPanel.perGb;
        const priceUnli = config.hargaPanel.unlimited;
        
        let msgPanel = `🖥 <b>LAYANAN PANEL PTERODACTYL</b>\n\n`;
        msgPanel += `💡 <b>Harga per GB:</b> Rp ${pricePerGb.toLocaleString()}\n`;
        msgPanel += `🚀 <b>Unlimited:</b> Rp ${priceUnli.toLocaleString()}\n\n`;
        msgPanel += `<i>Silakan pilih paket server yang diinginkan:</i>`;

        const buttons = [];
        let row = [];
        
        for (let i = 1; i <= 10; i++) {
            row.push({ text: `${i}GB`, callback_data: `buy_panel_${i}` });
            if (row.length === 4) {
                buttons.push(row);
                row = [];
            }
        }
        if (row.length > 0) buttons.push(row);

        buttons.push([{ text: "🚀 UNLIMITED", callback_data: "buy_panel_unli" }]);
        buttons.push([{ text: "🔙 Kembali", callback_data: "back_home" }]);

        await bot.editMessageCaption(msgPanel, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: buttons }
        }).catch(() => {});
    }

    if (data.startsWith("buy_panel_")) {
        const type = data.split("_")[2];
        let price;
        let planName;

        if (type === "unli") {
            price = config.hargaPanel.unlimited;
            planName = "UNLIMITED";
        } else {
            const gb = parseInt(type);
            price = gb * config.hargaPanel.perGb;
            planName = `${gb}GB`;
        }
        
        const saldoPath = "./database/saldo.json";
        if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}));
        const saldoDb = JSON.parse(fs.readFileSync(saldoPath));
        const userSaldo = saldoDb[userId] || 0;

        if (userSaldo < price) {
            return bot.answerCallbackQuery(query.id, { text: "Saldo Anda kurang!", show_alert: true });
        }

        panelSession[userId] = {
            step: "WAITING_PANEL_USERNAME",
            plan: planName,
            price: price,
            ramType: type 
        };

        await bot.sendMessage(chatId, `📝 <b>INPUT USERNAME PANEL</b>\n\nPaket: <b>${planName}</b>\nHarga: <b>Rp ${price.toLocaleString()}</b>\n\nSilakan kirim username yang ingin digunakan (Minimal 5 huruf/angka).`, { parse_mode: "HTML", reply_markup: { force_reply: true } });
        await bot.answerCallbackQuery(query.id);
    }
});

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (panelSession[userId] && panelSession[userId].step === "WAITING_PANEL_USERNAME" && text) {
        const usernameInput = text.trim().replace(/[^a-zA-Z0-9]/g, "");
        
        if (usernameInput.length < 5) {
            return bot.sendMessage(chatId, "⚠️ Username terlalu pendek, minimal 5 karakter.");
        }

        const { plan, price, ramType } = panelSession[userId];
        delete panelSession[userId];

        const waitMsg = await bot.sendMessage(chatId, "⏳ <b>Sedang membuat panel...</b>\nMohon tunggu sebentar.", { parse_mode: "HTML" });

        const saldoPath = "./database/saldo.json";
        const saldoDb = JSON.parse(fs.readFileSync(saldoPath));

        if ((saldoDb[userId] || 0) < price) {
            return bot.editMessageText("❌ <b>Gagal!</b> Saldo tidak mencukupi.", { chat_id: chatId, message_id: waitMsg.message_id, parse_mode: "HTML" });
        }

        saldoDb[userId] -= price;
        fs.writeFileSync(saldoPath, JSON.stringify(saldoDb, null, 2));

        let ram, disk, cpu;
        if (ramType === "unli") {
            ram = 0; 
            disk = 0; 
            cpu = 0;
        } else {
            const gb = parseInt(ramType);
            ram = gb * 1024;
            disk = gb * 1024;
            cpu = gb * 100;
        }

        const create = await createPanelAccount(usernameInput, ram, disk, cpu);

        if (create.success) {
            const successText = `✅ <b>PANEL BERHASIL DIBUAT!</b>\n━━━━━━━━━━━━━━━━━━━━━━\n👤 <b>Username:</b> <code>${create.data.username}</code>\n🔑 <b>Password:</b> <code>${create.data.password}</code>\n🔗 <b>Login:</b> ${create.data.login}\n━━━━━━━━━━━━━━━━━━━━━━\n📦 <b>Paket:</b> ${plan}\n💰 <b>Harga:</b> Rp ${price.toLocaleString()}\n📅 <b>Tanggal:</b> ${new Date().toLocaleString("id-ID")}\n\n<i>*Data akun telah diamankan.</i>`;
            
            await bot.editMessageText(successText, { chat_id: chatId, message_id: waitMsg.message_id, parse_mode: "HTML" });

            if (config.idchannel) {
                const strukChannel = `
🖥 <b>PEMBELIAN PANEL SUKSES</b>
━━━━━━━━━━━━━━━━━━━━━━
👤 <b>Buyer:</b> ${msg.from.first_name}
🆔 <b>ID:</b> <code>${userId}</code>
🔗 <b>Username:</b> @${msg.from.username || "-"}

📦 <b>Paket:</b> ${plan}
💰 <b>Harga:</b> Rp ${price.toLocaleString("id-ID")}
👤 <b>Username Panel:</b> <code>${create.data.username}</code>
🔗 <b>Login:</b> ${create.data.login}

📅 <b>Tanggal:</b> ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
━━━━━━━━━━━━━━━━━━━━━━
`;
                await bot.sendMessage(config.idchannel, strukChannel, { parse_mode: "HTML" }).catch((err) => {
                    console.log("Gagal kirim struk Panel ke channel:", err.message);
                });
            }
        } else {
            saldoDb[userId] += price;
            fs.writeFileSync(saldoPath, JSON.stringify(saldoDb, null, 2));
            await bot.editMessageText(`❌ <b>Error:</b> ${create.msg}\n\n<i>Saldo telah dikembalikan.</i>`, { chat_id: chatId, message_id: waitMsg.message_id, parse_mode: "HTML" });
        }
    }
});

//##################################//

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log("Update File:", __filename);
  delete require.cache[file];
  require(file);
});