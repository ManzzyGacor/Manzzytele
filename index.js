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
  try {
    const from = ctx.from;

    // Cek/Simpan User ke Database
    let user = await User.findOne({ telegramId: from.id });
    if (!user) {
      const assignedRole = from.username === 'man' ? 'Admin' : 'Member';
      user = await User.create({
        telegramId: from.id,
        username: from.username,
        role: assignedRole
      });
    }

    const welcomeMsg = `👋 *Selamat Datang di Manzzy ID*
━━━━━━━━━━━━━━━━━━
Layanan penyedia *Nokos Virtual* terpercaya.

👤 *User:* ${from.first_name}
🆔 *ID Anda:* \`${from.id}\`
💰 *Saldo:* Rp ${user.saldo.toLocaleString('id-ID')}
🛡️ *Role:* ${user.role}

Owner: @Manjikeduwa
━━━━━━━━━━━━━━━━━━`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🛍️ Beli Nokos', 'buy_nokos'),
        Markup.button.callback('💰 Isi Saldo', 'deposit')
      ],
      [
        Markup.button.url('👨‍💻 Hubungi Admin', 'https://t.me/Manjikeduwa')
      ]
    ]);

    // Coba kirim foto dulu, kalau gagal kirim teks aja
    try {
      await ctx.replyWithPhoto(BANNER_URL, {
        caption: welcomeMsg,
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (photoError) {
      console.error('Gagal kirim foto, mengirim teks saja:', photoError.description);
      await ctx.reply(welcomeMsg, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    }

  } catch (err) {
    console.error('Error di Command Start:', err);
  }
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