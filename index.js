const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- 1. KONEKSI DATABASE ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Terhubung ke MongoDB'))
  .catch((err) => console.error('❌ Gagal koneksi MongoDB:', err));

// Schema User Sederhana
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true },
  username: String,
  saldo: { type: Number, default: 0 },
  role: { type: String, default: 'Member' }
});
const User = mongoose.model('User', userSchema);

// --- 2. CONFIG DATA ---
const OWNER_ID = 7533630775;
const BANNER_URL = 'https://telegra.ph/file/your-image-id.jpg'; // Ganti dengan link foto kamu

// --- 3. LOGIKA BOT ---

bot.start(async (ctx) => {
  const from = ctx.from;

  // Cek/Simpan User ke Database
  let user = await User.findOne({ telegramId: from.id });
  if (!user) {
    // Jika username adalah 'man', otomatis jadi admin (sesuai request kamu sebelumnya)
    const assignedRole = from.username === 'man' ? 'Admin' : 'Member';
    
    user = await User.create({
      telegramId: from.id,
      username: from.username,
      role: assignedRole
    });
  }

  const welcomeMsg = `
👋 *Selamat Datang di Manzzy ID*
━━━━━━━━━━━━━━━━━━
Layanan penyedia *Nokos Virtual* terpercaya.
Dapatkan nomor virtual untuk berbagai kebutuhan sosial media Anda.

👤 *User:* ${from.first_name}
🆔 *ID Anda:* \`${from.id}\`
💰 *Saldo:* Rp ${user.saldo.toLocaleString('id-ID')}
🛡️ *Role:* ${user.role}

Owner: @Manjikeduwa
━━━━━━━━━━━━━━━━━━
Silahkan pilih menu di bawah:`;

  await ctx.replyWithPhoto(BANNER_URL, {
    caption: welcomeMsg,
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback('🛍️ Beli Nokos', 'buy_nokos'),
        Markup.button.callback('💰 Isi Saldo', 'deposit')
      ],
      [
        Markup.button.url('👨‍💻 Hubungi Admin', 'https://t.me/Manjikeduwa'),
        Markup.button.callback('⚙️ Menu Lain', 'other_menu')
      ]
    ])
  });
});

// Handler Tombol (Contoh sederhana)
bot.action('buy_nokos', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Fitur beli nokos sedang dalam pengembangan! 🚀');
});

bot.action('deposit', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Untuk isi saldo, silakan hubungi @Manjikeduwa');
});

// --- 4. RUN BOT ---
bot.launch().then(() => {
  console.log('🚀 Bot Manzzy ID sudah online!');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
