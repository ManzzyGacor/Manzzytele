/*
*/

// 🧩 Tambahkan ini di atas!
const fs = require("fs");
const chalk = require("chalk");

module.exports = {
TOKEN: "8598615314:AAGOw6yMBICnxlgdreZkLmy-IBUHZfPD8Dg", // Token dari @BotFather
OWNER_ID: "7533630775", // ID Telegram owner
urladmin: "https://t.me/Manjikeduwa",
urlchannel: "https://t.me/manzzyidnokos",
idchannel: "-1003349106139", // isi id channel untung notifikasi
botName: "ManzzyID Virtual Sim",
version: "10.0.0.0.0.0.0.0.0",
authorName: "Manzzy ID",
ownerName: "Manzzy",
  
//==============================================[ SETTING IMAGE ]=======//
ppthumb: "https://raw.githubusercontent.com/ManzzyGacor/Urlmanzzy/main/file_1775385903372_357.jpg",       // Foto utama bot (/start)

//==============================================[ SETTING RUMAHOTP ]=======//
RUMAHOTP: "rk-dev-cotujsceAwFPoN7lqebBjQAdszebyzdY",
type_ewallet_RUMAHOTP: "gopay", 
// Hanya Menerima Type Ewalet : Dana, Gopay, Ovo, ShopeePay, Link Aja ( Ovo, ShopeePay, Link Aja Belom Gw Coba Si😂 )
nomor_pencairan_RUMAHOTP: "089682142170", // Nomor Ewalet Masing Masing
atas_nama_ewallet_RUMAHOTP: "LUQMAN KHAKIM", // Ini Nama A/N Ewalet Masing Masing ( Gak Penting Sih Ini )
UNTUNG_NOKOS: 300,
UNTUNG_DEPOSIT: 200

};

// 🔁 Auto reload jika file config.js diubah
let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.blue(">> Update File :"), chalk.black.bgWhite(`${__filename}`));
  delete require.cache[file];
  require(file);
});