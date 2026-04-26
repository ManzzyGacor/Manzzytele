/*
# SCRIPT AUTO-ORDER V6

Script Ini Edit Oleh Izzyrap
Jangan Hapus Credits Ini!

Big Thanks To :
 • Izzyrap ( t.me/lynuxyz )
 • All Buyer Izzyrap Store
 • Allah SWT (Tuhanku)
 • Orang Tua saya (Panutan ku)
 • Keluarga (Support system)
 • All creator bot 
*/

// 🧩 Tambahkan ini di atas!
const fs = require("fs");
const chalk = require("chalk");

module.exports = {
TOKEN: "8598615314:AAGFqS2rsLlIjPqfMNPY2wvSZd0KvvnVa-8", // Token dari @BotFather
OWNER_ID: "7533630775", // ID Telegram owner
urladmin: "https://t.me/Manjikeduwa",
urlchannel: "https://t.me/manzzyidnokos",
idchannel: "-1003349106139", // isi id channel untung notifikasi
channelscammer: "-1003349106139", // id channel buat laporan scam
botName: "BOT AUTO ORDER NOKOS",
version: "1.0.0",
usernameBot: "ManzzyOTPBot", // isi username bot tanpa tag @
authorName: "💫 ManzzyID OTP",
  
danapay: "Tidak Tersedia",
qrispay: "https://raw.githubusercontent.com/ManzzyGacor/Urlmanzzy/main/file_1775385903372_357.jpg",
//==============================================[ SETTING IMAGE ]=======//
ppthumb: "https://raw.githubusercontent.com/ManzzyGacor/Urlmanzzy/main/file_1777208185488_846.jpg",       // Foto utama bot (/start)

//=============================================[ SETTING SUNTIK SOSMED]====
SMM_BASE_URL: 'https://fayupedia.id/api',
    SMM_API_ID: '222246', // ID dari file source SMM
    SMM_API_KEY: 'hfbbzc-1nlkvg-jtotxz-5ozrfz-ikjvz7', // Key dari file source SMM
    UNTUNG_SMM: 1500, // Keuntungan tambahan per order (bisa diubah)
    
 API_ID: 3460,
 API_HASH: "0a9ae",
 HARGA_SETOR: 4000,
//==============================================[ SETTING RUMAHOTP ]=======//
RUMAHOTP: "rk-dev-cotujsceAwFPoN7lqebBjQAdszebyzdY", // Apikey RumahOtp
UNTUNG_NOKOS: 400, // Ini Untung Nokos, Jadi Setiap Ada Yang Beli Nokos Untung 1000
UNTUNG_DEPOSIT: 400, // Ini Untung Deposit Jadi Kalo Ada Yang Deposit Bakal Ada Biaya Admin 500
HARGA_RESELLER: 10000, // harga reseller
type_ewallet_RUMAHOTP: "gopay", 
// Hanya Menerima Type Ewalet : Dana, Gopay, Ovo, ShopeePay, Link Aja ( Ovo, ShopeePay, Link Aja Belom Gw Coba Si😂 )
nomor_pencairan_RUMAHOTP: "+6289682142170",// Nomor Ewalet Masing Masing 

// setting panel
    panel: {
        domain: "https://panel-by.izzyrapstore.dpdns.org",
        plta: "ptla_2W4Op9KUriA5lHZMQ6ALyxh9mnFc4fn4FEvDCdvjLUm",
        pltc: "ptlc_fHG1BzbLsRoKcO5GTt2gA7TviV77tKZqDLTuPzth5in",
        egg: "15",
        loc: "1",
        image: "ghcr.io/parkervcp/yolks:nodejs_18",
        startup: "npm start"
    },
    hargaPanel: {
        perGb: 1000,
        unlimited: 2000
    },
    
};

// 🔁 Auto reload jika file config.js diubah
let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.blue(">> Update File :"), chalk.black.bgWhite(`${__filename}`));
  delete require.cache[file];
  require(file);
});
